import { EditorState, EditorSelection, Compartment, Transaction, StateField, StateEffect } from '@codemirror/state';
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType, lineNumbers } from '@codemirror/view';
import { shouldRefreshHeightMapForWidget } from './widgetHeightChange.js';
import { WordProcessorTableWidget, tableHeightEstimatesChanged, measureTableWidgetHeight } from './tableWidget.js';
import { createDeferredViewCallback } from './deferredViewCallback.js';
import { withScrollSnapshot } from './scrollSnapshot.js';
import { parseAndMatchHotkey } from './hotkeys.js';
import {
  filterSelectionOutsideHiddenSyntax,
  mapSelectionOutsideHiddenSyntax
} from './visibleSelection.js';
import { serializeNavigationTraceRecord } from './navigationDiagnostics.js';
import {
  buildFootnoteDecorations,
  footnoteEditRequiresReparse,
  formatFootnoteDefinition,
  nextFootnoteLabel,
  updateFootnoteDecorationsFromCached
} from './footnotes.js';
import {
  recordDecorationBuild,
  recordHeightMapRefresh,
  recordListMarkerRead,
  recordListMarkerWrite,
  recordWidgetHeightCacheUpdate,
  recordWidgetHeightRead,
  takeRenderLayoutMetrics
} from './renderLayoutDiagnostics.js';
import { setupFullNavigationCapture } from './navigationCapture.js';
import { extractTocHeadings } from './tocHeadings.js';
import { countDocumentText, findTocMatchRanges, getTocSearchState } from './tocSearch.js';
import { applyAutoHeading } from './autoHeading.js';
import { toCssFontFamily } from './fontFamilies.js';
import { setupLeftPanel } from './leftPanel.js';
import { setupPanelSwipe } from './panelSwipe.js';
import { formatMarkdownImage, parseMarkdownImage } from './markdownImages.js';
import {
  getMarkdownFormattingState,
  getMarkdownFormatRanges,
  getWmdxUnderlineSyntaxDelimiterRanges,
  getWmdxColorSyntaxRanges,
  isWmdxUnderlineSyntaxEnabled,
  setWmdxUnderlineSyntaxEnabled,
  toggleMarkdownFormat,
  toggleWmdxColorFormat,
  toggleUnderlineFormat
} from './markdownFormatting.js';
import { TABLE_ACTIONS } from './tableActions.js';
import { svgIcons } from './toolbarIcons.js';
import {
  BUILT_IN_HOLDING_ITEMS,
  BOTTOM_TOOLBAR_ITEMS,
  NO_GESTURE_ICON,
  OPEN_GROUP_ACTION_ID,
  normalizeBottomToolbarConfig,
  orderBottomToolbarPopupItems,
  TOOLBAR_TOGGLE_STYLE_ID
} from './toolbarConfig.js';
import {
  getToolbarGestureActionId,
  getToolbarGestureIndicatorEntries,
  getToolbarSwipeGesture,
  hasToolbarSwipeActions
} from './toolbarGestures.js';
import {
  renderBottomToolbarKeys,
  sanitizeToolbarSvg,
  toToolbarCssColor
} from './toolbarRenderer.js';
import { getFloatingToolbarPosition } from './toolbarPositioning.js';
import { openToolbarKeyPreferencesDialog } from './toolbarKeyPreferencesDialog.js';
import { defaultKeymap, history, historyKeymap, undo as cmUndo, redo as cmRedo, undoDepth, redoDepth } from '@codemirror/commands';
import {
  search,
  SearchQuery,
  setSearchQuery,
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll
} from '@codemirror/search';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, syntaxTree, forceParsing, HighlightStyle, foldEffect, unfoldEffect, codeFolding, foldedRanges } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { GFM, Table as GFMTable, Strikethrough as GFMStrikethrough, TaskList as GFMTaskList } from '@lezer/markdown';

let activeAdapter = null;
let refreshOpenTocPanel = null;
let revealActiveTocHeading = null;
let currentEditorMode = 'wysiwyg'; // 'wysiwyg' | 'live_preview' | 'source'
let isProgrammaticChange = false;
let pendingMarkdown = null;
let isLineWrapEnabled = true;
let activePopupGroup = null;
let activeToolbarRootKey = null;
let activePopupSurface = 'bottom';
let bottomToolbarConfig = normalizeBottomToolbarConfig(null);
let floatingToolbarConfig = normalizeBottomToolbarConfig(null);
let floatingToolbarSelectionFrame = 0;
let floatingToolbarEnabled = false;
let tocHideFileExtension = false;
let tocPanelEnabled = true;

let customHotkeys = {
  new: 'ctrl+n',
  history_back: 'alt+left',
  history_forward: 'alt+right',
  open: 'ctrl+o',
  save: 'ctrl+s',
  save_as: 'ctrl+shift+s',
  save_tabs: '',
  save_as_textpack: 'ctrl+shift+alt+s',
  export: 'ctrl+shift+e',
  image: 'ctrl+shift+i',
  settings: 'ctrl+,',
  toggle_toolbar: 'ctrl+t',
  line_wrap: 'ctrl+alt+w',
  open_with: 'ctrl+shift+o',
  line_numbers: 'ctrl+alt+l',
  bold: 'ctrl+b',
  italic: 'ctrl+i',
  underline: 'ctrl+u',
  underlineSolid: '',
  underlineDotted: '',
  underlineDashed: '',
  underlineDouble: '',
  underlineWavy: '',
  strikethrough: 'ctrl+shift+x',
  code: 'ctrl+e',
  link: 'ctrl+k',
  footnote: 'ctrl+shift+f',
  sourceEditing: 'ctrl+shift+u',
  blockQuote: 'ctrl+shift+q',
  callout: 'ctrl+alt+q',
  codeBlock: 'ctrl+shift+c',
  bulletedList: 'ctrl+shift+8',
  numberedList: 'ctrl+shift+7',
  todoList: 'ctrl+shift+l',
  indent: 'tab',
  outdent: 'shift+tab',
  horizontalLine: 'ctrl+shift+h',
  autoHeading: '',
  findAndReplace: 'ctrl+f',
  heading_p: 'ctrl+alt+0',
  heading_1: 'ctrl+alt+1',
  heading_2: 'ctrl+alt+2',
  heading_3: 'ctrl+alt+3',
  heading_4: 'ctrl+alt+4',
  heading_5: 'ctrl+alt+5',
  heading_6: 'ctrl+alt+6',
  highlightCycle: 'ctrl+alt+y',
  highlightYellow: '',
  highlightGreen: '',
  highlightPink: '',
  highlightBlue: '',
  penCycle: 'ctrl+alt+r',
  penRed: '',
  penGreen: '',
  penBlue: '',
  penPurple: ''
};

class ListMarkerWidget extends WidgetType {
  constructor(source, isBullet) {
    super();
    this.source = source;
    this.isBullet = isBullet;
  }
  eq(other) {
    return other instanceof ListMarkerWidget &&
      other.source === this.source &&
      other.isBullet === this.isBullet;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = this.isBullet ? 'cm-list-bullet' : 'cm-list-number';
    span.textContent = this.isBullet ? '•' : this.source;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(checked, pos, len) {
    super();
    this.checked = checked;
    this.pos = pos;
    this.len = len || 3;
  }

  eq(other) {
    return (
      other instanceof CheckboxWidget &&
      other.checked === this.checked &&
      other.pos === this.pos &&
      other.len === this.len
    );
  }

  toDOM(view) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-todo-checkbox';
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const newText = this.checked ? '[ ]' : '[x]';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + this.len, insert: newText }
      });
    });
    return input;
  }
}

export const heightMapRefreshEffect = StateEffect.define();

const deferViewCallback = createDeferredViewCallback();

function dispatchWithScrollSnapshot(view, effects) {
  view.dispatch({ effects: withScrollSnapshot(view, effects) });
}

function scheduleHeightMapRefresh(view) {
  const mode = currentEditorMode;
  recordHeightMapRefresh(mode, 'scheduled');
  deferViewCallback(view, activeView => {
    recordHeightMapRefresh(mode, 'dispatched');
    dispatchWithScrollSnapshot(
      activeView,
      heightMapRefreshEffect.of(null)
    );
  });
}

const listMarkerMeasurementKey = {};

function measureListMarkerGutter(line, marker) {
  const lineRect = line.getBoundingClientRect();
  if (!lineRect.width) return null;

  const ownerDocument = line.ownerDocument;
  const textBlock = line.querySelector('.cm-list-block-text');
  if (textBlock) {
    const textRect = Array.from(textBlock.getClientRects()).find(
      candidate => candidate.width > 0 && candidate.height > 0
    ) || textBlock.getBoundingClientRect();
    if (textRect.width > 0 && textRect.height > 0) {
      return Math.max(0, textRect.left - lineRect.left);
    }
  }

  const showText = ownerDocument.defaultView.NodeFilter.SHOW_TEXT;
  const walker = ownerDocument.createTreeWalker(line, showText);
  let textNode;

  while ((textNode = walker.nextNode())) {
    if (textNode.parentElement?.closest(
      '.cm-list-bullet, .cm-list-number, .cm-todo-checkbox, .cm-hidden-syntax'
    )) {
      continue;
    }

    for (let offset = 0; offset < textNode.nodeValue.length; offset++) {
      const range = ownerDocument.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + 1);
      const rect = Array.from(range.getClientRects()).find(
        candidate => candidate.width > 0 && candidate.height > 0
      );
      if (rect) {
        return Math.max(0, rect.left - lineRect.left);
      }
    }
  }

  const markerRect = marker.getBoundingClientRect();
  const markerStyle = ownerDocument.defaultView.getComputedStyle(marker);
  const markerGap = Number.parseFloat(markerStyle.marginRight) || 4;
  return Math.max(0, markerRect.right - lineRect.left + markerGap);
}

function listItemTextRange(tree, doc, line, markerEnd) {
  let from = markerEnd;
  tree.iterate({
    from: markerEnd,
    to: line.to,
    enter: node => {
      if (node.name === 'TaskMarker') from = Math.max(from, node.to);
    }
  });
  while (from < line.to && /[ \t]/.test(doc.sliceString(from, from + 1))) {
    from++;
  }
  return from < line.to ? { from, to: line.to } : null;
}

function scheduleListMarkerMeasurements(view, force = false) {
  if (
    !view ||
    !view.dom?.isConnected ||
    !document.body.classList.contains('list-wrap-under-text')
  ) {
    return;
  }

  const measurementMode = currentEditorMode;
  view.requestMeasure({
    key: listMarkerMeasurementKey,
    read: () => {
      const lines = Array.from(
        view.contentDOM.querySelectorAll('.cm-line.cm-list-item')
      );

      const measurements = [];
      for (const line of lines) {
        if (
          !force &&
          line.style.getPropertyValue('--list-marker-gutter')
        ) {
          continue;
        }

        const marker = line.querySelector(
          '.cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
        );
        if (!marker) {
          measurements.push({ line });
          continue;
        }

        const gutter = measureListMarkerGutter(line, marker);
        if (Number.isFinite(gutter) && gutter > 0) {
          measurements.push({ line, gutter });
        } else {
          measurements.push({ line });
        }
      }
      recordListMarkerRead(measurementMode, lines.length, measurements.length);
      return { enabled: true, measurements };
    },
    write: result => {
      if (!result) return;
      let changedCount = 0;
      let totalDeltaPx = 0;
      let maxDeltaPx = 0;
      for (const { line, gutter } of result.measurements) {
        if (!line.isConnected || !view.contentDOM.contains(line)) continue;
        if (result.enabled && Number.isFinite(gutter) && gutter > 0) {
          const previous = Number.parseFloat(line.style.getPropertyValue('--list-marker-gutter')) || 0;
          const nextValue = `${gutter}px`;
          if (line.style.getPropertyValue('--list-marker-gutter') !== nextValue) {
            const delta = Math.abs(gutter - previous);
            changedCount++;
            totalDeltaPx += delta;
            maxDeltaPx = Math.max(maxDeltaPx, delta);
          }
          line.style.setProperty('--list-marker-gutter', nextValue);
        } else {
          const previous = Number.parseFloat(line.style.getPropertyValue('--list-marker-gutter')) || 0;
          if (line.style.getPropertyValue('--list-marker-gutter')) {
            changedCount++;
            totalDeltaPx += previous;
            maxDeltaPx = Math.max(maxDeltaPx, previous);
          }
          line.style.removeProperty('--list-marker-gutter');
        }
      }
      recordListMarkerWrite(measurementMode, changedCount, totalDeltaPx, maxDeltaPx);
    }
  });
}

const listMarkerMeasurementPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    scheduleListMarkerMeasurements(view, true);
  }

  update(update) {
    const typographyChanged = update.transactions.some(transaction =>
      transaction.effects.some(effect =>
        effect.is(typographySettingsEffect) ||
        effect.is(heightMapRefreshEffect)
      )
    );
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      typographyChanged
    ) {
      scheduleListMarkerMeasurements(
        update.view,
        update.docChanged || typographyChanged
      );
    }
  }
}, {});

const measuredWidgetHeights = new Map();
const MAX_MEASURED_WIDGET_HEIGHTS = 256;

function measuredWidgetHeightKey(kind, contentKey, width, styleSignature) {
  const stableWidth = Math.round(Math.max(0, Number(width) || 0) * 10) / 10;
  return JSON.stringify([kind, contentKey, stableWidth, styleSignature]);
}

function estimatedWidgetHeight(key, fallback) {
  const measured = measuredWidgetHeights.get(key);
  return Number.isFinite(measured) && measured > 0 ? measured : fallback;
}

function rememberWidgetHeight(view, key, element, kind, estimatedHeight) {
  if (!view || !element) return;
  const measurementMode = currentEditorMode;
  view.requestMeasure({
    read: () => {
      if (!element.isConnected) return null;
      const height = element.getBoundingClientRect().height;
      recordWidgetHeightRead(measurementMode, kind, height);
      return height;
    },
    write: height => {
      if (!Number.isFinite(height) || height <= 0) return;
      const previous = measuredWidgetHeights.get(key);
      if (previous !== undefined && Math.abs(previous - height) < 1) return;
      const shouldRefreshHeightMap = shouldRefreshHeightMapForWidget(
        previous,
        height,
        estimatedHeight
      );

      recordWidgetHeightCacheUpdate(
        measurementMode,
        kind,
        previous ?? estimatedHeight,
        height
      );
      measuredWidgetHeights.set(key, height);
      if (measuredWidgetHeights.size > MAX_MEASURED_WIDGET_HEIGHTS) {
        measuredWidgetHeights.delete(measuredWidgetHeights.keys().next().value);
      }
      if (shouldRefreshHeightMap) scheduleHeightMapRefresh(view);
    }
  });
}

function activeContentWidth() {
  const el = document.querySelector('.cm-editor > .cm-scroller > .cm-content');
  const w = el?.getBoundingClientRect().width;
  if (w && w > 0) return w;
  if (typeof window !== 'undefined' && window.innerWidth) {
    return Math.max(280, window.innerWidth - 32);
  }
  return 360;
}

function activeTypographySignature() {
  const element = document.querySelector(
    '.cm-editor > .cm-scroller > .cm-content'
  );
  if (!element) return 'default';

  const style = getComputedStyle(element);
  const customProperties = [];
  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);
    if (property.startsWith('--')) customProperties.push(property);
  }
  customProperties.sort();

  return JSON.stringify({
    font: style.font,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    width: style.width,
    devicePixelRatio: window.devicePixelRatio || 1,
    customProperties: customProperties.map(property => [
      property,
      style.getPropertyValue(property).trim()
    ])
  });
}

class EmptyLineCursorAnchorWidget extends WidgetType {
  eq(other) {
    return other instanceof EmptyLineCursorAnchorWidget;
  }

  toDOM() {
    const anchor = document.createElement('span');
    anchor.className = 'cm-empty-line-cursor-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    anchor.setAttribute('contenteditable', 'false');
    anchor.textContent = '\u200b';
    return anchor;
  }

  ignoreEvent() {
    return true;
  }
}

const emptyLineCursorAnchorWidget = new EmptyLineCursorAnchorWidget();

class CodeBlockHeaderWidget extends WidgetType {
  constructor(lang, codeText) {
    super();
    this.lang = lang || 'Plain text';
    this.codeText = codeText;
    const width = activeContentWidth();
    const sig = activeTypographySignature();
    this.heightKey = measuredWidgetHeightKey(
      'codeblock-header',
      `${this.lang}:${this.codeText.length}`,
      width,
      sig
    );
    this.heightEstimate = estimatedWidgetHeight(this.heightKey, 28);
  }

  get estimatedHeight() {
    return this.heightEstimate;
  }

  eq(other) {
    return (
      other instanceof CodeBlockHeaderWidget &&
      other.lang === this.lang &&
      other.codeText === this.codeText &&
      other.heightEstimate === this.heightEstimate
    );
  }

  toDOM(view) {
    const header = document.createElement('div');
    header.className = 'cm-codeblock-header';
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;' +
      'background:var(--code-block-label-bg, rgba(255,255,255,.12));' +
      'padding:4px 10px;border-radius:var(--code-block-border-radius, 6px) ' +
      'var(--code-block-border-radius, 6px) 0 0;font-size:12px;font-weight:bold;' +
      'font-family:monospace;' +
      'user-select:none;border:1px solid var(--code-block-border-color, rgba(255,255,255,.2));' +
      'border-bottom-width:1px;';
    const langSpan = document.createElement('span');
    langSpan.className = 'cm-codeblock-lang-label';
    langSpan.textContent = this.lang;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'cm-codeblock-copy-btn';
    copyBtn.textContent = 'COPY';
    copyBtn.style.cssText =
      'background:var(--code-copy-bg, transparent);' +
      'border:1px solid var(--code-block-border-color, rgba(255,255,255,.35));' +
      'color:var(--code-copy-color, #fff);border-radius:3px;' +
      'padding:2px 8px;font-size:11px;cursor:pointer;font-weight:bold;';

    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this.codeText).catch(() => {});
      }
      if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
        window.AndroidNative.showToast('Code block copied to clipboard');
      }
    });

    header.appendChild(langSpan);
    header.appendChild(copyBtn);

    rememberWidgetHeight(view, this.heightKey, header, 'code_header', this.heightEstimate);
    return header;
  }
}

const calloutTypeIcons = {
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  question: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  faq: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  todo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>`,
  example: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  note: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  tip: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A7 7 0 1 1 15.5 14.5A7 7 0 0 1 8.5 14.5z"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  important: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  danger: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
};

let calloutTypeIconOverrides = {};

function getCalloutTitleStart(line, match) {
  const customTitle = match[5];
  if (!customTitle || !customTitle.trim()) return null;
  const index = line.text.indexOf(customTitle, match[1].length + match[2].length);
  return index < 0 ? null : line.from + index;
}

class CalloutTitleWidget extends WidgetType {
  constructor(title, type, foldMarker, isFolded, foldFrom, foldTo, titleIsInSource = false) {
    super();
    this.title = title;
    this.type = (type || 'note').toLowerCase();
    this.foldMarker = foldMarker; // '+' or '-' or undefined
    this.isFolded = isFolded;
    this.foldFrom = foldFrom;
    this.foldTo = foldTo;
    this.titleIsInSource = titleIsInSource;
    const width = activeContentWidth();
    const sig = activeTypographySignature();
    this.heightKey = measuredWidgetHeightKey('callout-title', `${this.type}:${this.title}`, width, sig);
    this.heightEstimate = estimatedWidgetHeight(this.heightKey, 32);
  }

  get estimatedHeight() {
    return this.heightEstimate;
  }

  eq(other) {
    return (
      other instanceof CalloutTitleWidget &&
      other.title === this.title &&
      other.type === this.type &&
      other.foldMarker === this.foldMarker &&
      other.isFolded === this.isFolded &&
      other.foldFrom === this.foldFrom &&
      other.foldTo === this.foldTo &&
      other.titleIsInSource === this.titleIsInSource &&
      other.heightEstimate === this.heightEstimate
    );
  }

  toDOM(view) {
    const activeFolds = foldedRanges(view.state);
    let currentlyFolded = false;
    if (this.foldFrom != null && this.foldTo != null && this.foldTo > this.foldFrom) {
      activeFolds.between(this.foldFrom, this.foldTo, (from, to) => {
        if (from === this.foldFrom && to === this.foldTo) {
          currentlyFolded = true;
        }
      });
    }

    const span = document.createElement('span');
    span.className = 'cm-callout-title-container' +
      (this.foldMarker ? ' is-foldable' : '') +
      (this.titleIsInSource ? ' has-source-title' : '');

    const iconOverride = calloutTypeIconOverrides[this.type];
    const allowedIcons = ['info', 'question', 'faq', 'todo', 'example', 'note', 'tip', 'warning', 'important', 'danger'];
    const activeIconKey = (iconOverride && iconOverride !== 'default' && allowedIcons.includes(iconOverride))
      ? iconOverride
      : this.type;
    const iconSvg = calloutTypeIcons[activeIconKey] || calloutTypeIcons.info;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'cm-callout-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.innerHTML = iconSvg;
    span.appendChild(iconSpan);

    if (!this.titleIsInSource) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'cm-callout-title-text';
      titleSpan.textContent = this.title;
      span.appendChild(titleSpan);
    }

    if (this.foldMarker) {
      const btn = document.createElement('button');
      btn.className = 'cm-callout-fold-btn';
      btn.type = 'button';
      btn.tabIndex = 0;
      btn.setAttribute('aria-expanded', currentlyFolded ? 'false' : 'true');
      btn.setAttribute('aria-label', `${currentlyFolded ? 'Expand' : 'Collapse'} callout ${this.title}`);
      btn.innerHTML = currentlyFolded
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

      span.appendChild(btn);

      const toggleFold = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.foldFrom != null && this.foldTo != null && this.foldTo > this.foldFrom) {
          const liveFolds = foldedRanges(view.state);
          let isFoldedNow = false;
          liveFolds.between(this.foldFrom, this.foldTo, (from, to) => {
            if (from === this.foldFrom && to === this.foldTo) {
              isFoldedNow = true;
            }
          });

          if (isFoldedNow) {
            view.dispatch({
              effects: [
                unfoldEffect.of({ from: this.foldFrom, to: this.foldTo }),
                heightMapRefreshEffect.of(null)
              ]
            });
          } else {
            view.dispatch({
              effects: [
                foldEffect.of({ from: this.foldFrom, to: this.foldTo }),
                heightMapRefreshEffect.of(null)
              ]
            });
          }
        }
      };

      btn.addEventListener('click', toggleFold);
    }

    rememberWidgetHeight(view, this.heightKey, span, 'callout_title', this.heightEstimate);
    return span;
  }

  ignoreEvent(event) {
    if (event.type === 'click' || event.type === 'pointerdown') {
      return !!event.target.closest('.cm-callout-fold-btn, .cm-callout-icon');
    }
    return true;
  }
}

export function cleanHeadingText(rawText) {
  return rawText
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function ensureCaretVisibleMinimal(view, pos) {
  if (!view || pos == null) return false;
  try {
    const coords = view.coordsAtPos(pos);
    const scroller = view.scrollDOM;
    if (coords && scroller) {
      const scrollerRect = scroller.getBoundingClientRect();
      const topPadding = 48; // Account for top search bar / header area
      const bottomPadding = 48; // Account for bottom control bar

      if (coords.top < scrollerRect.top + topPadding) {
        scroller.scrollTop -= (scrollerRect.top + topPadding - coords.top + 10);
      } else if (coords.bottom > scrollerRect.bottom - bottomPadding) {
        scroller.scrollTop += (coords.bottom - (scrollerRect.bottom - bottomPadding) + 10);
      }
    }
  } catch (e) {}
  return true;
}

export function scrollToPositionUpperMiddle(view, pos, options = {}) {
  if (!view || pos == null) return false;
  view.dispatch({
    selection: { anchor: pos, head: pos }
  });

  const performScroll = () => {
    try {
      const coords = view.coordsAtPos(pos);
      const scroller = view.scrollDOM;
      if (coords && scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        const currentTop = scroller.scrollTop;
        const targetOffset = coords.top - scrollerRect.top + currentTop;
        const desiredTop = targetOffset - (scrollerRect.height * 0.30);

        if (Math.abs(currentTop - desiredTop) > 20) {
          scroller.scrollTop = Math.max(0, desiredTop);
        }
      }
    } catch (e) {
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    }
  };

  requestAnimationFrame(() => {
    performScroll();
    setTimeout(performScroll, 50);
  });

  if (options.focus !== false) {
    view.focus();
  }
  return true;
}

const tocNavigationByDocument = new Map();
let activeTocDocumentKey = 'untitled';
let tocDocumentHistoryState = { canGoBack: false, canGoForward: false };
let tocDefaultHeadingLevel = 2;
let tocExpandLevelsPerTap = 1;
const tocExpansionState = {
  documentKey: 'untitled',
  collapsedHeadingKeys: new Set(),
  isAllCollapsed: false,
  initialized: false,
  activeHeadingKey: null,
  centerOnNextUpdate: false
};

function getTocNavigationHistory() {
  if (!tocNavigationByDocument.has(activeTocDocumentKey)) {
    tocNavigationByDocument.set(activeTocDocumentKey, { back: [], forward: [] });
  }
  return tocNavigationByDocument.get(activeTocDocumentKey);
}

function captureTocNavigationState(view) {
  if (!view?.state || !view.scrollDOM) return null;
  const selection = view.state.selection.main;
  return {
    anchor: selection.anchor,
    head: selection.head,
    scrollTop: view.scrollDOM.scrollTop
  };
}

function updateTocHistoryButtons() {
  const history = getTocNavigationHistory();
  const back = document.querySelector('#toc-history-back');
  const forward = document.querySelector('#toc-history-forward');
  if (back) back.disabled = history.back.length === 0 && !tocDocumentHistoryState.canGoBack;
  if (forward) {
    forward.disabled = history.forward.length === 0 && !tocDocumentHistoryState.canGoForward;
  }
}

function setActiveTocDocumentKey(key) {
  const nextKey = key || 'untitled';
  if (nextKey !== activeTocDocumentKey) {
    activeTocDocumentKey = nextKey;
    tocExpansionState.documentKey = nextKey;
    tocExpansionState.collapsedHeadingKeys.clear();
    tocExpansionState.isAllCollapsed = false;
    tocExpansionState.initialized = false;
    tocExpansionState.activeHeadingKey = null;
    tocExpansionState.centerOnNextUpdate = true;
    refreshOpenTocPanel?.();
  }
  updateTocHistoryButtons();
}

function stripTocDocumentExtension(fileName) {
  const lowerName = fileName.toLowerCase();
  for (const extension of ['.textpack.zip', '.textpack']) {
    if (lowerName.endsWith(extension) && fileName.length > extension.length) {
      return fileName.slice(0, -extension.length);
    }
  }
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

function getTocDocumentDisplayName(fileName) {
  const isUnsavedDocument =
    activeTocDocumentKey === 'untitled' ||
    activeTocDocumentKey.startsWith('untitled:');
  return tocHideFileExtension && !isUnsavedDocument
    ? stripTocDocumentExtension(fileName)
    : fileName;
}

function refreshTocDocumentNameField() {
  const nameInput = document.querySelector('#toc-document-name');
  if (!nameInput || nameInput.dataset.fullName === undefined) return;
  const displayName = getTocDocumentDisplayName(nameInput.dataset.fullName);
  nameInput.dataset.committedName = displayName;
  if (!nameInput.dataset.editing) nameInput.value = displayName;
}

function recordTocNavigation(view, targetPos) {
  const current = captureTocNavigationState(view);
  if (!current) return false;
  if (
    Number.isInteger(targetPos) &&
    current.anchor === targetPos &&
    current.head === targetPos
  ) {
    return false;
  }

  const history = getTocNavigationHistory();
  history.back.push(current);
  history.forward.length = 0;
  if (
    window.AndroidNative &&
    typeof window.AndroidNative.onInDocumentNavigationOccurred === 'function'
  ) {
    window.AndroidNative.onInDocumentNavigationOccurred();
  }
  updateTocHistoryButtons();
  return true;
}

function navigateFootnote(view, targetPos) {
  if (!view || !Number.isInteger(targetPos)) return false;
  recordTocNavigation(view, targetPos);
  return scrollToPositionUpperMiddle(view, targetPos, { focus: false });
}

function restoreTocNavigationState(view, state) {
  if (!view?.state || !view.scrollDOM || !state) return false;
  const docLength = view.state.doc.length;
  const anchor = Math.max(0, Math.min(docLength, state.anchor));
  const head = Math.max(0, Math.min(docLength, state.head));
  view.dispatch({ selection: { anchor, head } });
  requestAnimationFrame(() => {
    if (!view.scrollDOM) return;
    view.scrollDOM.scrollTop = Math.max(0, state.scrollTop || 0);
    updateTocActiveSection();
  });
  return true;
}

function navigateTocHistory(direction) {
  const history = getTocNavigationHistory();
  const source = direction === 'back' ? history.back : history.forward;
  const destination = direction === 'back' ? history.forward : history.back;
  const view = activeAdapter?.view;
  if (!source.length || !view) return false;

  const current = captureTocNavigationState(view);
  const target = source.pop();
  if (current) destination.push(current);
  restoreTocNavigationState(view, target);
  updateTocHistoryButtons();
  return true;
}

export function scrollToHeading(view, targetHeading) {
  if (!view || !targetHeading) return false;
  const targetClean = cleanHeadingText(targetHeading).toLowerCase();
  const doc = view.state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (/^#{1,6}\s+/.test(line.text.trim())) {
      const lineClean = cleanHeadingText(line.text).toLowerCase();
      if (lineClean === targetClean) {
        recordTocNavigation(view, line.from);
        return scrollToPositionUpperMiddle(view, line.from);
      }
    }
  }
  return false;
}

class WikilinkWidget extends WidgetType {
  constructor(label, target) {
    super();
    this.label = label;
    this.target = target;
  }

  eq(other) {
    return (
      other instanceof WikilinkWidget &&
      other.label === this.label &&
      other.target === this.target
    );
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'cm-link cm-wikilink';
    span.textContent = this.label;

    if (this.target) {
      span.setAttribute('role', 'link');
      span.setAttribute('tabindex', '0');
      span.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.target.startsWith('#')) {
          scrollToHeading(view, this.target.slice(1));
        }
      });
      span.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (this.target.startsWith('#')) {
            scrollToHeading(view, this.target.slice(1));
          }
        }
      });
    }

    return span;
  }
}

export const typographySettingsEffect = StateEffect.define();


const imageAspectCache = new Map();

class ImagePreviewWidget extends WidgetType {
  constructor(url, alt, from, to, imageWidth = null) {
    super();
    this.url = url;
    this.alt = alt || 'image';
    this.from = from;
    this.to = to;
    this.imageWidth = imageWidth;
    const contentWidth = activeContentWidth();
    const sig = activeTypographySignature();
    this.heightKey = measuredWidgetHeightKey(
      'image-preview',
      `${this.url}:${this.imageWidth ?? 'auto'}`,
      contentWidth,
      sig
    );
    const aspect = imageAspectCache.get(this.url);
    const estimatedWidth = this.imageWidth
      ? Math.min(this.imageWidth, contentWidth)
      : contentWidth;
    const fallbackHeight = aspect ? Math.round(estimatedWidth / aspect) : 180;
    this.heightEstimate = estimatedWidgetHeight(this.heightKey, fallbackHeight);
  }

  get estimatedHeight() {
    return this.heightEstimate;
  }

  eq(other) {
    return (
      other instanceof ImagePreviewWidget &&
      other.url === this.url &&
      other.alt === this.alt &&
      other.imageWidth === this.imageWidth &&
      other.from === this.from &&
      other.to === this.to &&
      other.heightEstimate === this.heightEstimate
    );
  }

  toDOM(view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-image-preview-wrapper';
    wrapper.style.cssText = `max-width: 100%; min-height: ${this.heightEstimate}px; margin: 6px 0; display: block; box-sizing: border-box; touch-action: manipulation; user-select: none; -webkit-user-select: none;`;

    const img = document.createElement('img');
    img.src = this.url;
    img.alt = this.alt;
    img.draggable = false;
    img.style.cssText = `max-width: 100%; width: ${this.imageWidth ? `${this.imageWidth}px` : 'auto'}; height: auto; border-radius: 6px; display: block; border: 1px solid var(--border-color, #444);`;

    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const aspect = img.naturalWidth / img.naturalHeight;
        imageAspectCache.set(this.url, aspect);
        const renderedHeight = Math.ceil(img.getBoundingClientRect().height);
        if (renderedHeight > 0) {
          wrapper.style.minHeight = `${renderedHeight}px`;
        }
        view.requestMeasure();
        rememberWidgetHeight(view, this.heightKey, wrapper, 'image_preview', this.heightEstimate);
      }
    };

    img.onerror = () => {
      imageAspectCache.delete(this.url);
      img.remove();
      const fallbackBox = document.createElement('div');
      fallbackBox.className = 'cm-image-error-fallback';
      fallbackBox.style.cssText = 'padding: 12px 16px; border: 1px dashed var(--border-color, #666); border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--text-color, #888); font-size: 13px; font-style: italic;';
      fallbackBox.textContent = `[Image: ${this.alt || 'failed to load'}]`;
      wrapper.appendChild(fallbackBox);
      wrapper.style.minHeight = '0px';
      view.requestMeasure();
      rememberWidgetHeight(view, this.heightKey, wrapper, 'image_preview', this.heightEstimate);
    };

    const actions = document.createElement('div');
    actions.className = 'cm-image-actions';
    actions.setAttribute('aria-label', 'Image actions');
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'cm-image-action-edit';
    editButton.setAttribute('aria-label', 'Edit image');
    editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>Edit</span>';
    editButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      hideActions();
      openImageEditDialog(view, this.from, this.to, this.alt, this.url, this.imageWidth);
    });
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'cm-image-action-delete';
    deleteButton.setAttribute('aria-label', 'Delete image');
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg><span>Delete</span>';
    deleteButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      hideActions();
      openImageDeleteConfirmation(view, this.from, this.to);
    });
    actions.append(editButton, deleteButton);

    let lastPressPoint = null;
    const positionActions = () => {
      if (!actions.isConnected || !lastPressPoint) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const width = actions.offsetWidth || 144;
      const height = actions.offsetHeight || 48;
      const minLeft = viewportLeft + 8;
      const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - width - 8);
      const centeredLeft = lastPressPoint.x - width / 2;
      const left = Math.max(minLeft, Math.min(centeredLeft, maxLeft));
      const minTop = viewportTop + 8;
      const maxTop = Math.max(minTop, viewportTop + viewportHeight - height - 8);
      const gap = 14;
      const aboveTop = lastPressPoint.y - height - gap;
      const belowTop = lastPressPoint.y + gap;
      let top;
      if (aboveTop >= minTop) {
        top = aboveTop;
      } else if (belowTop <= maxTop) {
        top = belowTop;
      } else {
        top = Math.max(minTop, Math.min(aboveTop, maxTop));
      }
      actions.style.left = `${left}px`;
      actions.style.top = `${Math.max(minTop, Math.min(top, maxTop))}px`;
    };
    const showActions = (point) => {
      lastPressPoint = point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ? point
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      if (!actions.isConnected) document.body.appendChild(actions);
      actions.classList.add('visible');
      positionActions();
    };
    const hideActions = () => {
      actions.classList.remove('visible');
      actions.remove();
    };
    const toggleActions = event => {
      event.preventDefault();
      event.stopPropagation();
      if (actions.classList.contains('visible')) hideActions();
      else showActions({ x: event.clientX, y: event.clientY });
    };
    let pressTimer = null;
    let suppressNextImageClick = false;
    const clearPressTimer = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    wrapper.addEventListener('pointerdown', event => {
      if (event.target.closest('.cm-image-actions')) return;
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      const startX = event.clientX;
      const startY = event.clientY;
      suppressNextImageClick = false;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        suppressNextImageClick = true;
        showActions({ x: startX, y: startY });
      }, 550);
      wrapper._imagePressStart = { x: startX, y: startY };
    });
    wrapper.addEventListener('pointermove', event => {
      const start = wrapper._imagePressStart;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
        clearPressTimer();
        wrapper._imagePressStart = null;
      }
    });
    wrapper.addEventListener('pointerup', () => {
      clearPressTimer();
      wrapper._imagePressStart = null;
    });
    wrapper.addEventListener('pointercancel', () => {
      clearPressTimer();
      wrapper._imagePressStart = null;
    });
    wrapper.addEventListener('click', event => {
      if (suppressNextImageClick) {
        suppressNextImageClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      toggleActions(event);
    });
    wrapper.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      suppressNextImageClick = true;
      showActions({ x: event.clientX, y: event.clientY });
    });
    const dismissActions = event => {
      if (
        !wrapper.contains(event.target) &&
        !actions.contains(event.target) &&
        actions.classList.contains('visible')
      ) {
        hideActions();
      }
    };
    const repositionActions = () => positionActions();
    document.addEventListener('pointerdown', dismissActions, true);
    window.visualViewport?.addEventListener('resize', repositionActions);
    wrapper._imageDismissHandler = dismissActions;
    wrapper._imageRepositionHandler = repositionActions;
    wrapper._clearImagePressTimer = clearPressTimer;
    wrapper._hideImageActions = hideActions;

    if (img.parentNode !== wrapper) wrapper.appendChild(img);
    rememberWidgetHeight(view, this.heightKey, wrapper, 'image_preview', this.heightEstimate);
    return wrapper;
  }

  destroy(dom) {
    dom?._clearImagePressTimer?.();
    dom?._hideImageActions?.();
    if (dom?._imageDismissHandler) {
      document.removeEventListener(
        'pointerdown',
        dom._imageDismissHandler,
        true
      );
    }
    if (dom?._imageRepositionHandler) {
      window.visualViewport?.removeEventListener('resize', dom._imageRepositionHandler);
    }
  }

  ignoreEvent(event) {
    // Image previews are atomic widgets. Letting pointer events reach CodeMirror
    // places the text cursor beside the hidden Markdown instead of activating
    // the image's own tap controls.
    return Boolean(event.target?.closest?.('.cm-image-preview-wrapper'));
  }
}

class EmptyTableCellWidget extends WidgetType {
  constructor(widthCh, isHeader, isFirst, isLast) {
    super();
    this.widthCh = widthCh;
    this.isHeader = isHeader;
    this.isFirst = isFirst;
    this.isLast = isLast;
  }

  eq(other) {
    return (
      other instanceof EmptyTableCellWidget &&
      other.widthCh === this.widthCh &&
      other.isHeader === this.isHeader &&
      other.isFirst === this.isFirst &&
      other.isLast === this.isLast
    );
  }

  toDOM() {
    const cell = document.createElement('span');
    cell.className = [
      'cm-table-cell',
      'cm-table-empty-cell',
      ...(this.isHeader ? ['cm-table-header-cell'] : []),
      ...(this.isFirst ? ['cm-table-first-cell'] : []),
      ...(this.isLast ? ['cm-table-last-cell'] : [])
    ].join(' ');
    cell.style.width = `${this.widthCh}ch`;
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }

  ignoreEvent() {
    return true;
  }
}

class GFMTableWidget extends WidgetType {
  constructor(tableText, from, to) {
    super();
    this.tableText = tableText;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return (
      other instanceof GFMTableWidget &&
      other.tableText === this.tableText &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  ignoreEvent(event) {
    return true;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-gfm-table-container';
    container.style.cssText =
      'overflow-x: auto; margin: 12px 0; border: 1px solid var(--table-border-color, var(--border-color, #444)); border-radius: 6px; position: relative; width: 100%; box-sizing: border-box; background-color: var(--bg-color, #000); padding: 8px;';

    const lines = this.tableText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return container;

    const isSeparator = (line) =>
      /^\|?\s*[:?]-+[:?]?(\s*\|\s*[:?]-+[:?]?)*\s*\|?$/.test(line);

    const parseCells = (line) => {
      let trimmed = line.trim();
      if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
      if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
      return trimmed.split('|').map(c => c.trim());
    };

    const headerLine = lines[0];
    const dataLines = lines.slice(1).filter(l => !isSeparator(l));

    const headers = parseCells(headerLine);
    const rows = dataLines.map(parseCells);

    const stopPropagation = (e) => {
      e.stopPropagation();
    };

    const getDynamicRange = () => {
      try {
        const pos = view.posAtDOM(container);
        const line = view.state.doc.lineAt(pos);
        let startL = line.number;
        let endL = line.number;
        while (startL > 1 && view.state.doc.line(startL - 1).text.trim().startsWith('|')) {
          startL--;
        }
        while (endL < view.state.doc.lines && view.state.doc.line(endL + 1).text.trim().startsWith('|')) {
          endL++;
        }
        return {
          from: view.state.doc.line(startL).from,
          to: view.state.doc.line(endL).to
        };
      } catch (e) {
        return { from: this.from, to: this.to };
      }
    };

    const updateDoc = () => {
      const headerRowStr = '| ' + headers.join(' | ') + ' |';
      const sepRowStr = '| ' + headers.map(() => '---').join(' | ') + ' |';
      const dataRowStrs = rows.map(r => '| ' + r.join(' | ') + ' |');

      const newMarkdown = [headerRowStr, sepRowStr, ...dataRowStrs].join('\n');
      if (newMarkdown !== this.tableText) {
        const range = getDynamicRange();
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: newMarkdown }
        });
      }
    };

    // Table toolbar controls
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; font-size: 12px;';

    const btnStyle = 'padding: 3px 8px; background: rgba(255,255,255,0.12); border: 1px solid #555; border-radius: 4px; color: #fff; cursor: pointer;';

    const addRowBtn = document.createElement('button');
    addRowBtn.textContent = '+ Row';
    addRowBtn.style.cssText = btnStyle;
    addRowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      rows.push(new Array(headers.length).fill(''));
      updateDoc();
    });

    const delRowBtn = document.createElement('button');
    delRowBtn.textContent = '- Row';
    delRowBtn.style.cssText = btnStyle;
    delRowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (rows.length > 1) {
        rows.pop();
        updateDoc();
      }
    });

    const addColBtn = document.createElement('button');
    addColBtn.textContent = '+ Col';
    addColBtn.style.cssText = btnStyle;
    addColBtn.addEventListener('click', (e) => {
      e.preventDefault();
      headers.push(`Header ${headers.length + 1}`);
      rows.forEach(r => r.push(''));
      updateDoc();
    });

    const delColBtn = document.createElement('button');
    delColBtn.textContent = '- Col';
    delColBtn.style.cssText = btnStyle;
    delColBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (headers.length > 1) {
        headers.pop();
        rows.forEach(r => r.pop());
        updateDoc();
      }
    });

    toolbar.appendChild(addRowBtn);
    toolbar.appendChild(delRowBtn);
    toolbar.appendChild(addColBtn);
    toolbar.appendChild(delColBtn);
    container.appendChild(toolbar);

    const border =
      'var(--table-border-width, 1px) var(--table-border-style, solid) var(--table-border-color, #444)';

    const table = document.createElement('table');
    table.style.cssText =
      'width:100%;border-collapse:collapse;color:var(--table-cell-color, var(--text-color, #fff));' +
      'font-size:16px;table-layout:auto;';

    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    headers.forEach((hText, colIdx) => {
      const th = document.createElement('th');
      th.contentEditable = 'true';
      th.style.cssText =
        `border:${border};padding:var(--table-cell-padding,8px);` +
        'background:var(--table-header-bg,rgba(255,255,255,.12));' +
        'color:var(--table-header-color,var(--text-color,#fff));' +
        'font-weight:var(--table-header-font-weight,700);' +
        'text-align:left;outline:none;min-width:60px;';
      th.textContent = hText;
      th.addEventListener('keydown', stopPropagation);
      th.addEventListener('keyup', stopPropagation);
      th.addEventListener('input', () => {
        headers[colIdx] = th.textContent || '';
      });
      th.addEventListener('blur', () => {
        updateDoc();
      });
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((rowCells, rowIdx) => {
      const tr = document.createElement('tr');
      while (rowCells.length < headers.length) rowCells.push('');
      rowCells.forEach((cellText, colIdx) => {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.style.cssText =
          `border:${border};padding:var(--table-cell-padding,8px);` +
          'background:var(--table-cell-bg,transparent);' +
          'color:var(--table-cell-color,var(--text-color,#fff));' +
          'text-align:left;outline:none;min-width:60px;';
        td.textContent = cellText;
        td.addEventListener('keydown', stopPropagation);
        td.addEventListener('keyup', stopPropagation);
        td.addEventListener('input', () => {
          rows[rowIdx][colIdx] = td.textContent || '';
        });
        td.addEventListener('blur', () => {
          updateDoc();
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
    return container;
  }
}

const customHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--heading-1-color, var(--heading-color, #ffffff))', fontWeight: 'var(--heading-1-font-weight, var(--heading-font-weight, bold))' },
  { tag: tags.heading2, color: 'var(--heading-2-color, var(--heading-color, #ffffff))', fontWeight: 'var(--heading-2-font-weight, var(--heading-font-weight, bold))' },
  { tag: tags.heading3, color: 'var(--heading-3-color, var(--heading-color, #ffffff))', fontWeight: 'var(--heading-3-font-weight, var(--heading-font-weight, bold))' },
  { tag: tags.heading4, color: 'var(--heading-4-color, var(--heading-color, #ffffff))', fontWeight: 'var(--heading-4-font-weight, var(--heading-font-weight, bold))' },
  { tag: tags.heading5, color: 'var(--heading-5-color, var(--heading-color, #ffffff))', fontWeight: 'var(--heading-5-font-weight, var(--heading-font-weight, bold))' },
  { tag: tags.heading6, color: 'var(--heading-6-color, var(--heading-color, #ffffff))', fontWeight: 'var(--heading-6-font-weight, var(--heading-font-weight, bold))' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'var(--italic-color, inherit)', fontWeight: 'var(--italic-font-weight, normal)' },
  { tag: tags.strong, fontWeight: 'var(--bold-font-weight, bold)', color: 'var(--bold-color, inherit)' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--link-color, #29b6f6)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--code-color, #ff80ab)', backgroundColor: 'var(--code-bg-color, rgba(255,255,255,0.1))' },
  { tag: tags.meta, color: '#888888' },
  { tag: tags.comment, color: '#888888' },
  { tag: tags.propertyName, color: '#29b6f6' },
  { tag: tags.string, color: '#00e676' },
  { tag: tags.number, color: '#ffea00' },
  { tag: tags.keyword, color: '#ff4081', fontWeight: 'bold' }
]);

export { EditorState } from '@codemirror/state';
export { EditorView } from '@codemirror/view';
export { cursorLineDown, cursorLineUp } from '@codemirror/commands';
export { markdown } from '@codemirror/lang-markdown';

export const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.initializedFoldLines = new Set();
    this.hiddenSyntaxRanges = Decoration.none;
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    const needsRefresh =
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(heightMapRefreshEffect))
      );

    if (needsRefresh) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    recordDecorationBuild(currentEditorMode, 'live_preview_plugin');
    const previousHiddenSyntaxRanges = this.hiddenSyntaxRanges;
    this.hiddenSyntaxRanges = Decoration.none;
    try {
      return this._buildDecorationsInternal(view);
    } catch (e) {
      window.AndroidNative?.reportDiagnostic?.('decoration_error', 0);
      this.hiddenSyntaxRanges = previousHiddenSyntaxRanges;
      return this.decorations || Decoration.none;
    }
  }

  _buildDecorationsInternal(view) {
    const builder = [];
    const hiddenSyntaxRanges = [];
    const hideSyntax = (from, to) => {
      if (to > from) {
        const range = Decoration.replace({}).range(from, to);
        builder.push(range);
        hiddenSyntaxRanges.push(range);
      }
    };
    const lineClasses = new Map();

    const addLineClass = (lineFrom, ...classNames) => {
      if (!lineClasses.has(lineFrom)) lineClasses.set(lineFrom, new Set());
      for (const className of classNames) {
        lineClasses.get(lineFrom).add(className);
      }
    };

    if (currentEditorMode === 'source') {
      return Decoration.none;
    }

    const tree = syntaxTree(view.state);
    const selection = view.state.selection.main;
    const isPureWysiwyg = (currentEditorMode === 'wysiwyg');
    const doc = view.state.doc;
    const decorationRanges = view.visibleRanges;
    const underlineSyntaxRanges = isWmdxUnderlineSyntaxEnabled()
      ? [...new Map(decorationRanges
        .flatMap(range => getMarkdownFormatRanges(view, 'underline', range))
        .map(range => [`${range.wrapperFrom}:${range.wrapperTo}`, range])).values()]
      : [...new Map(decorationRanges
        .flatMap(range => getMarkdownFormatRanges(view, 'underline', range))
        .filter(range => range.kind === 'html')
        .map(range => [`${range.wrapperFrom}:${range.wrapperTo}`, range])).values()];
    const colorSyntaxRanges = [...new Map(decorationRanges
      .flatMap(range => getWmdxColorSyntaxRanges(view.state, range))
      .map(range => [`${range.group}:${range.wrapperFrom}:${range.wrapperTo}`, range])).values()];

    const getQuotedLineInfo = (lineNum) => {
      if (lineNum < 1 || lineNum > doc.lines) return null;
      const l = doc.line(lineNum);
      const match = l.text.match(/^(\s*(?:>\s*)+)/);
      if (!match) return null;

      const firstText = /\S/.exec(l.text);
      const probe = firstText ? l.from + firstText.index : l.from;
      const resolvedNode = tree.resolveInner(probe, 1);

      for (let ancestor = resolvedNode; ancestor; ancestor = ancestor.parent) {
        if (ancestor.name === 'FencedCode' || ancestor.name === 'CodeBlock' || ancestor.name === 'Table') {
          return null;
        }
      }

      const quotePrefix = match[1];
      const depth = (quotePrefix.match(/>/g) || []).length;
      return { line: l, quotePrefix, depth };
    };

    const isQuotedLine = (lineNum) => getQuotedLineInfo(lineNum) !== null;

    const calloutOpenerInfo = new Map();
    const processedBlockquoteLines = new Set();
    const calloutLineAttributes = new Map(); // lineFrom -> { type, depth }

    for (const { from, to } of decorationRanges) {
      const firstVisibleLine = doc.lineAt(from).number;
      const lastVisibleLine = doc.lineAt(Math.max(from, to - 1)).number;

      for (let lineNumber = firstVisibleLine; lineNumber <= lastVisibleLine; lineNumber++) {
        const line = doc.line(lineNumber);
        const firstText = /\S/.exec(line.text);
        const probe = firstText ? line.from + firstText.index : line.from;
        const resolvedNode = tree.resolveInner(probe, 1);

        let paragraphNode = null;
        let insideListItem = false;
        let insideCodeBlock = false;
        let insideTable = false;

        for (let ancestor = resolvedNode; ancestor; ancestor = ancestor.parent) {
          if (ancestor.name === 'Paragraph') paragraphNode = ancestor;
          if (ancestor.name === 'ListItem') insideListItem = true;
          if (ancestor.name === 'FencedCode' || ancestor.name === 'CodeBlock') {
            insideCodeBlock = true;
          }
          if (ancestor.name === 'Table') insideTable = true;
        }

        if (insideCodeBlock || insideTable) continue;

        if (insideListItem) {
          addLineClass(line.from, 'cm-list-item');
          if (/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line.text)) {
            addLineClass(line.from, 'cm-todo-list-item');
          }
        }

        const isLineActive = !isPureWysiwyg && (
          selection.empty
            ? selection.head >= line.from && selection.head <= line.to
            : selection.from < line.to && selection.to > line.from
        );

        const wikilinkRegex = /(?<!\!)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
        let wikilinkMatch;
        while ((wikilinkMatch = wikilinkRegex.exec(line.text)) !== null) {
          if (wikilinkMatch.index > 0 && line.text[wikilinkMatch.index - 1] === '!') continue;

          const matchStart = line.from + wikilinkMatch.index;
          const matchEnd = matchStart + wikilinkMatch[0].length;
          const target = wikilinkMatch[1];
          const alias = wikilinkMatch[2];
          const displayLabel = (alias !== undefined && alias.trim().length > 0)
            ? alias
            : (target.startsWith('#') ? target.slice(1) : target);

          let labelStart, labelEnd;
          if (alias !== undefined) {
            labelStart = matchStart + 2 + target.length + 1;
            labelEnd = matchEnd - 2;
          } else {
            labelStart = matchStart + 2;
            labelEnd = matchEnd - 2;
          }

          if (!isLineActive) {
            if (!isPureWysiwyg) {
              builder.push(Decoration.replace({
                widget: new WikilinkWidget(displayLabel, target)
              }).range(matchStart, matchEnd));
            }
          } else if (labelEnd > labelStart) {
            builder.push(Decoration.mark({ class: 'cm-link cm-wikilink' }).range(labelStart, labelEnd));
          }
        }

        if (insideListItem) {
          continue;
        }

        if (paragraphNode) {
          addLineClass(line.from, 'cm-paragraph');

          const paragraphFirstLine = doc.lineAt(paragraphNode.from);
          const paragraphLastLine = doc.lineAt(
            Math.max(paragraphNode.from, paragraphNode.to - 1)
          );

          if (line.from === paragraphFirstLine.from) {
            addLineClass(line.from, 'cm-paragraph-first');
          }
          if (line.from === paragraphLastLine.from) {
            addLineClass(line.from, 'cm-paragraph-last');
          }
        }
      }
    }
    for (const { from, to } of view.visibleRanges) {
      const firstVisibleLine = doc.lineAt(from).number;
      const lastVisibleLine = doc.lineAt(Math.max(from, to - 1)).number;

      for (let lineNumber = firstVisibleLine; lineNumber <= lastVisibleLine; lineNumber++) {
        if (processedBlockquoteLines.has(lineNumber)) continue;

        if (isQuotedLine(lineNumber)) {
          let blockStart = lineNumber;
          while (blockStart > 1 && isQuotedLine(blockStart - 1)) {
            blockStart--;
          }

          let curLine = blockStart;
          let inCallout = false;

          let openerLineNum = null;
          let lastBodyLineNum = null;

          const activeCalloutsStack = []; // [{ depth, type, openerLineNum, lastBodyLineNum }]

          while (curLine <= doc.lines && isQuotedLine(curLine)) {
            processedBlockquoteLines.add(curLine);
            const lineInfo = getQuotedLineInfo(curLine);
            const line = lineInfo.line;
            const currentDepth = lineInfo.depth;

            // Unwind stack if current line depth is shallow
            while (activeCalloutsStack.length > 0 && activeCalloutsStack[activeCalloutsStack.length - 1].depth > currentDepth) {
              activeCalloutsStack.pop();
            }

            const match = line.text.match(/^(\s*(?:>\s*)+)(\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?)(?:[ \t]+(.*))?\s*$/i);

            if (match) {
              const type = match[3].toLowerCase();
              const foldMarker = match[4]; // '+' or '-' or undefined
              const customTitle = match[5];
              const markerStart = line.from + match[1].length;
              const markerEnd = markerStart + match[2].length;
              const titleStart = getCalloutTitleStart(line, match);

              const calloutObj = {
                depth: currentDepth,
                type,
                openerLineNum: curLine,
                lastBodyLineNum: curLine,
                info: {
                  type,
                  depth: currentDepth,
                  foldMarker,
                  customTitle,
                  markerStart,
                  markerEnd,
                  titleStart,
                  bodyFrom: line.to,
                  bodyTo: line.to
                }
              };

              activeCalloutsStack.push(calloutObj);
              calloutOpenerInfo.set(line.from, calloutObj.info);

              // Update bodyTo for all ancestor callouts on stack
              for (const ancestor of activeCalloutsStack) {
                if (ancestor !== calloutObj) {
                  ancestor.lastBodyLineNum = curLine;
                  ancestor.info.bodyTo = line.to;
                }
              }

              addLineClass(line.from, 'cm-blockquote', 'cm-callout', 'cm-callout-title');
              calloutLineAttributes.set(line.from, { type, depth: currentDepth });
            } else if (activeCalloutsStack.length > 0) {
              // Update all callouts on stack whose depth <= currentDepth
              for (const calloutObj of activeCalloutsStack) {
                if (calloutObj.depth <= currentDepth) {
                  calloutObj.lastBodyLineNum = curLine;
                  calloutObj.info.bodyTo = line.to;
                }
              }

              const currentCallout = activeCalloutsStack[activeCalloutsStack.length - 1];
              addLineClass(line.from, 'cm-blockquote', 'cm-callout', 'cm-callout-body');
              calloutLineAttributes.set(line.from, { type: currentCallout.type, depth: currentCallout.depth });
            } else {
              addLineClass(line.from, 'cm-blockquote');
            }

            curLine++;
          }

          if (openerLineNum && lastBodyLineNum && lastBodyLineNum > openerLineNum) {
            const openerLine = doc.line(openerLineNum);
            const lastBodyLine = doc.line(lastBodyLineNum);
            const info = calloutOpenerInfo.get(openerLine.from);
            if (info) {
              info.bodyFrom = openerLine.to;
              info.bodyTo = lastBodyLine.to;
            }
          }
        }
      }
    }
    for (const lineFrom of calloutLineAttributes.keys()) {
      const line = doc.lineAt(lineFrom);
      const hasListMarker = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?\s+/.test(line.text);
      const hasTaskMarker = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line.text);
      const classes = lineClasses.get(lineFrom);
      if (classes) {
        if (hasListMarker) {
          classes.add('cm-list-item');
          classes.add('cm-callout-list-item');
        } else {
          classes.delete('cm-list-item');
          classes.delete('cm-callout-list-item');
        }
        if (hasTaskMarker) classes.add('cm-todo-list-item');
        else classes.delete('cm-todo-list-item');
      }
    }

    for (const { from, to } of decorationRanges) {
      tree.iterate({
        from,
        to,
        enter: (node) => {
          const line = view.state.doc.lineAt(node.from);
          const isNodeActive = !isPureWysiwyg && (
            selection.empty
              ? selection.head >= node.from && selection.head <= node.to
              : selection.from < node.to && selection.to > node.from
          );

          const atxHeading = /^ATXHeading([1-6])$/.exec(node.name);
          const setextHeading = /^SetextHeading([12])$/.exec(node.name);
          const headingLevel = atxHeading?.[1] ?? setextHeading?.[1];

          if (headingLevel && !isPureWysiwyg) {
            addLineClass(
              line.from,
              'cm-heading',
              `cm-heading-${headingLevel}`
            );
          }

          if (node.name === 'HeaderMark' && !isNodeActive) {
            if (!isPureWysiwyg) {
              const end = Math.min(node.to + 1, line.to);
              if (end > node.from && end <= line.to) {
                hideSyntax(node.from, end);
              }
            }
          }

          if (node.name === 'StrongEmphasis') {
            builder.push(Decoration.mark({ class: 'cm-bold' }).range(node.from, node.to));
          }
          if (node.name === 'EmphasisMark' && !isNodeActive) {
            const isWmdxUnderlineDelimiter = underlineSyntaxRanges.some(range =>
              range.kind === 'wmdx' && (
                (node.from >= range.wrapperFrom && node.to <= range.contentFrom) ||
                (node.from >= range.contentTo && node.to <= range.wrapperTo)
              )
            );
            if (!isWmdxUnderlineDelimiter && !isPureWysiwyg) {
              hideSyntax(node.from, node.to);
            }
          }

          if (node.name === 'Emphasis') {
            const isWmdxUnderline = underlineSyntaxRanges.some(range =>
              range.wrapperFrom === node.from && range.wrapperTo === node.to
            );
            if (!isWmdxUnderline) {
              builder.push(Decoration.mark({ class: 'cm-italic' }).range(node.from, node.to));
            }
          }

          if (node.name === 'Strikethrough') {
            builder.push(Decoration.mark({ class: 'cm-strikethrough' }).range(node.from, node.to));
          }
          if (node.name === 'StrikethroughMark' && !isNodeActive) {
            if (!isPureWysiwyg) hideSyntax(node.from, node.to);
          }

          if (node.name === 'InlineCode') {
            builder.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to));
          }
          if (node.name === 'CodeMark' && !isNodeActive) {
            if (!isPureWysiwyg) hideSyntax(node.from, node.to);
          }


          if (node.name === 'ListMark') {
            const marker = view.state.doc.sliceString(node.from, node.to);
            const isBullet = /^[-*+]$/.test(marker.trim());
            if (!isNodeActive) {
              if (!isPureWysiwyg) {
                builder.push(Decoration.replace({
                  widget: new ListMarkerWidget(marker, isBullet)
                }).range(node.from, node.to));
              }
            } else {
              builder.push(Decoration.mark({
                class: isBullet ? 'cm-list-bullet' : 'cm-list-number'
              }).range(node.from, node.to));
            }
            if (!isPureWysiwyg) {
              const textRange = listItemTextRange(tree, doc, line, node.to);
              if (textRange) {
                builder.push(
                  Decoration.mark({ class: 'cm-list-block-text' })
                    .range(textRange.from, textRange.to)
                );
              }
            }
          }

          if (node.name === 'QuoteMark' && !isNodeActive) {
            if (!isPureWysiwyg) {
              // Hide the quote marker and its separator together. Leaving the
              // separator visible shifts the first callout line relative to
              // wrapped lines, regardless of the user's font settings.
              const end = Math.min(node.to + 1, line.to);
              if (end > node.from) {
                hideSyntax(node.from, end);
              }
            }
          }

          if (node.name === 'TaskMarker') {
            const taskText = view.state.doc.sliceString(node.from, node.to);
            const isChecked = taskText.toLowerCase().includes('x');
            if (!isNodeActive && node.to > node.from) {
              if (!isPureWysiwyg) {
                builder.push(Decoration.replace({ widget: new CheckboxWidget(isChecked, node.from, node.to - node.from) }).range(node.from, node.to));
              }
            }
          }

          if (node.name === 'HorizontalRule') {
            addLineClass(line.from, 'cm-hr');
            if (!isNodeActive && node.to > node.from) {
              if (!isPureWysiwyg) hideSyntax(node.from, node.to);
            }
          }

          if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
            if (currentEditorMode === 'wysiwyg') {
              return;
            }
            const startLine = view.state.doc.lineAt(node.from);
            const endLine = view.state.doc.lineAt(node.to);
            for (let l = startLine.number; l <= endLine.number; l++) {
              const codeLine = view.state.doc.line(l);
              addLineClass(codeLine.from, 'cm-codeblock-line');
              if (l === startLine.number) addLineClass(codeLine.from, 'cm-codeblock-first');
              if (l === endLine.number) addLineClass(codeLine.from, 'cm-codeblock-last');
              const isFenceLine = /^\s*(?:`{3,}|~{3,})/.test(codeLine.text);
              if (codeLine.to > codeLine.from && !isFenceLine) {
                builder.push(
                  Decoration.mark({ class: 'cm-codeblock-text' })
                    .range(codeLine.from, codeLine.to)
                );
              }
            }
            if (line.from === node.from) {
              const codeText = view.state.doc.sliceString(node.from, node.to);
              const firstLineText = line.text;
              const langMatch = firstLineText.match(/^```(\w+)/);
              const lang = langMatch ? langMatch[1] : 'Plain text';
              const headerWidget = new CodeBlockHeaderWidget(lang, codeText);

              if (!isNodeActive) {
                builder.push(
                  Decoration.replace({ widget: headerWidget }).range(line.from, line.to)
                );
              } else {
                builder.push(
                  Decoration.widget({ widget: headerWidget, side: -1 }).range(line.from)
                );
              }
            }
          }

          if (node.name === 'Table') {
            // Table rendering in WYSIWYG & Live Preview is handled by tableStateField block widget.
            // Ignore Table node inner decorations here to avoid decoration conflicts.
            return;
          }

          if (node.name === 'Link' || node.name === 'URL') {
            const raw = view.state.doc.sliceString(node.from, node.to);
            const match = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (match) {
              const labelFrom = node.from + 1;
              const labelTo = labelFrom + match[1].length;
              builder.push(
                Decoration.mark({ class: 'cm-link' }).range(labelFrom, labelTo)
              );

              if (!isNodeActive && !isPureWysiwyg) {
                if (labelFrom > node.from) {
                  hideSyntax(node.from, labelFrom);
                }
                if (node.to > labelTo) {
                  hideSyntax(labelTo, node.to);
                }
              }
            }
          }

          if (node.name === 'Image') {
            const imgText = view.state.doc.sliceString(node.from, node.to);
            const image = parseMarkdownImage(imgText);
            if (image && !isNodeActive && !isPureWysiwyg) {
              builder.push(Decoration.replace({
                widget: new ImagePreviewWidget(
                  image.url,
                  image.alt,
                  node.from,
                  node.to,
                  image.width ?? null
                )
              }).range(node.from, node.to));
            }
          }
        }
      });
    }

    for (const range of underlineSyntaxRanges) {
      const isRangeActive = !isPureWysiwyg && (
        selection.empty
          ? selection.head >= range.wrapperFrom && selection.head <= range.wrapperTo
          : selection.from < range.wrapperTo && selection.to > range.wrapperFrom
      );
      if (range.kind === 'html' && !isRangeActive) {
        hideSyntax(range.wrapperFrom, range.contentFrom);
        hideSyntax(range.contentTo, range.wrapperTo);
      } else if (range.kind === 'wmdx' && !isRangeActive) {
        for (const delimiter of getWmdxUnderlineSyntaxDelimiterRanges(range)) {
          hideSyntax(delimiter.from, delimiter.to);
        }
      }
      if (range.kind === 'wmdx') {
        builder.push(Decoration.mark({
          class: 'cm-wmdx-underline-syntax'
        }).range(range.wrapperFrom, range.wrapperTo));
      }
      builder.push(Decoration.mark({
        class: `cm-underline cm-underline-${range.style}`
      }).range(range.contentFrom, range.contentTo));
    }

    for (const range of colorSyntaxRanges) {
      const isRangeActive = !isPureWysiwyg && (
        selection.empty
          ? selection.head >= range.wrapperFrom && selection.head <= range.wrapperTo
          : selection.from < range.wrapperTo && selection.to > range.wrapperFrom
      );
      if (!isRangeActive) {
        hideSyntax(range.wrapperFrom, range.contentFrom);
        hideSyntax(range.contentTo, range.wrapperTo);
      }
      builder.push(Decoration.mark({
        class: `cm-wmdx-${range.group}-${range.color}`
      }).range(range.contentFrom, range.contentTo));
    }

    const activeFolds = foldedRanges(view.state);

    for (const [lineFrom, info] of calloutOpenerInfo) {
      const line = doc.lineAt(lineFrom);
      const customTitle = info.customTitle?.trim() || '';
      const isMarkerActive = !isPureWysiwyg && (
        selection.empty
          ? selection.head >= info.markerStart && selection.head <= info.markerEnd
          : selection.from < info.markerEnd && selection.to > info.markerStart
      );

      const hasBody = info.bodyTo > info.bodyFrom;

      if (hasBody && info.foldMarker) {
        let isCurrentlyFolded = false;
        activeFolds.between(info.bodyFrom, info.bodyTo, (from, to) => {
          if (from === info.bodyFrom && to === info.bodyTo) {
            isCurrentlyFolded = true;
          }
        });

        if (info.foldMarker === '-' && !isCurrentlyFolded && !this.initializedFoldLines.has(info.bodyFrom)) {
          this.initializedFoldLines.add(info.bodyFrom);
          Promise.resolve().then(() => {
            view.dispatch({
              effects: [
                foldEffect.of({ from: info.bodyFrom, to: info.bodyTo }),
                heightMapRefreshEffect.of(null)
              ]
            });
          });
        }
      }

      if (!isMarkerActive && !isPureWysiwyg) {
        let isFolded = false;
        if (hasBody) {
          activeFolds.between(info.bodyFrom, info.bodyTo, (from, to) => {
            if (from === info.bodyFrom && to === info.bodyTo) {
              isFolded = true;
            }
          });
        }

        const displayTitle = customTitle ||
          (info.type.charAt(0).toUpperCase() + info.type.slice(1).toLowerCase());
        const titleIsInSource = info.titleStart != null;
        const widgetEnd = titleIsInSource ? info.titleStart : line.to;

        builder.push(Decoration.replace({
          widget: new CalloutTitleWidget(
            displayTitle,
            info.type,
            info.foldMarker,
            isFolded,
            info.bodyFrom,
            info.bodyTo,
            titleIsInSource
          )
        }).range(info.markerStart, widgetEnd));

        if (titleIsInSource) {
          builder.push(Decoration.mark({
            class: `cm-callout-title-text is-source${info.foldMarker ? ' is-foldable' : ''}`
          }).range(info.titleStart, line.to));
        }
        lineClasses.get(lineFrom)?.add('cm-callout-title-rendered');
      }
    }

    for (const [lineFrom, attrs] of calloutLineAttributes) {
      builder.push(Decoration.line({
        attributes: {
          'data-callout-type': attrs.type,
          'data-callout-depth': String(attrs.depth),
          style: `--callout-depth-offset:${Math.max(0, attrs.depth - 1) * 12}px`
        }
      }).range(lineFrom));
    }

    const persistentLayoutClasses = new Set([
      'cm-paragraph',
      'cm-paragraph-first',
      'cm-paragraph-last',
      'cm-list-item',
      'cm-heading',
      'cm-heading-1',
      'cm-heading-2',
      'cm-heading-3',
      'cm-heading-4',
      'cm-heading-5',
      'cm-heading-6',
      'cm-blockquote',
      'cm-hr'
    ]);

    for (const [lineFrom, classes] of lineClasses) {
      const remaining = [...classes].filter(className =>
        currentEditorMode === 'source' ||
        !persistentLayoutClasses.has(className)
      );
      if (!remaining.length) continue;

      builder.push(
        Decoration.line({
          attributes: { class: remaining.join(' ') }
        }).range(lineFrom)
      );
    }

    // Filter and sanitize decoration ranges against document length
    const validBuilder = builder.filter(d => 0 <= d.from && d.from <= d.to && d.to <= doc.length);
    validBuilder.sort((a, b) => a.from - b.from || a.to - b.to);
    const validHiddenSyntaxRanges = hiddenSyntaxRanges.filter(
      d => 0 <= d.from && d.from <= d.to && d.to <= doc.length
    );
    validHiddenSyntaxRanges.sort((a, b) => a.from - b.from || a.to - b.to);
    this.hiddenSyntaxRanges = Decoration.set(validHiddenSyntaxRanges, true);
    return Decoration.set(validBuilder, true);
  }
}, {
  decorations: v => v.decorations
});

const footnoteStateField = StateField.define({
  create(state) {
    return buildFootnoteDecorations(state, {
      mode: currentEditorMode,
      onEdit: definition => openFootnoteInsertionDialog({ definition }),
      onNavigate: navigateFootnote
    });
  },
  update(current, tr) {
    const refresh = tr.effects.some(effect => effect.is(typographySettingsEffect));
    const revealRefresh =
      currentEditorMode === 'live_preview' &&
      tr.selectionSet &&
      current.hasFootnotes;
    if (
      !tr.docChanged &&
      !refresh &&
      !revealRefresh
    ) {
      return current;
    }
    const options = {
      mode: currentEditorMode,
      onEdit: definition => openFootnoteInsertionDialog({ definition }),
      onNavigate: navigateFootnote
    };
    if (!refresh && !footnoteEditRequiresReparse(current, tr, currentEditorMode)) {
      return updateFootnoteDecorationsFromCached(
        tr.state,
        current,
        tr.changes,
        options
      );
    }
    return buildFootnoteDecorations(tr.state, {
      ...options
    });
  },
  provide: field =>
    EditorView.decorations.from(field, value => value.decorations)
});

function mergeHiddenSyntaxRanges(docLength, ...sets) {
  const activeSets = sets.filter(set => set && set !== Decoration.none);
  if (!activeSets.length) return Decoration.none;
  if (activeSets.length === 1) return activeSets[0];

  const ranges = [];
  for (const set of activeSets) {
    set.between(0, docLength, (from, to) => {
      if (to > from) ranges.push(Decoration.replace({}).range(from, to));
    });
  }
  if (!ranges.length) return Decoration.none;
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

function hiddenSyntaxRangesForView(view) {
  const wysiwygRanges =
    view.state.field(heightMapField, false)?.hiddenSyntaxRanges;
  const livePreviewRanges =
    view.plugin(livePreviewPlugin)?.hiddenSyntaxRanges;
  const baseRanges = currentEditorMode === 'wysiwyg'
    ? (wysiwygRanges ?? livePreviewRanges)
    : (livePreviewRanges ?? wysiwygRanges);
  const footnoteRanges =
    view.state.field(footnoteStateField, false)?.hiddenSyntaxRanges ?? Decoration.none;
  const codeBlockRanges =
    view.state.field(wysiwygCodeBlockField, false)?.hiddenSyntaxRanges ?? Decoration.none;
  return mergeHiddenSyntaxRanges(
    view.state.doc.length,
    baseRanges,
    codeBlockRanges,
    footnoteRanges
  );
}

function hiddenSyntaxRangesForState(state) {
  const ranges = [];
  const sets = [
    state.field(heightMapField, false)?.hiddenSyntaxRanges,
    state.field(wysiwygCodeBlockField, false)?.hiddenSyntaxRanges,
    state.field(footnoteStateField, false)?.hiddenSyntaxRanges
  ];

  for (const set of sets) {
    set?.between(0, state.doc.length, (from, to) => {
      if (to > from) ranges.push({ from, to });
    });
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

let pendingNativeCursorAnchorView = null;
let nativeCursorAnchorFrame = null;

function scheduleNativeCursorAnchor(view) {
  const bridge = window.AndroidNative;
  if (!bridge || typeof bridge.onSelectionChanged !== 'function') return;

  pendingNativeCursorAnchorView = view;
  if (nativeCursorAnchorFrame !== null) return;

  nativeCursorAnchorFrame = requestAnimationFrame(() => {
    nativeCursorAnchorFrame = null;
    const activeView = pendingNativeCursorAnchorView;
    pendingNativeCursorAnchorView = null;
    if (!activeView?.dom?.isConnected) return;

    const caret = activeView.coordsAtPos(activeView.state.selection.main.head);
    if (!caret) return;

    const visualViewport = window.visualViewport;
    bridge.onSelectionChanged(JSON.stringify({
      left: caret.left,
      top: caret.top,
      bottom: caret.bottom,
      devicePixelRatio: window.devicePixelRatio || 1,
      visualViewportScale: visualViewport?.scale || 1,
      visualViewportOffsetLeft: visualViewport?.offsetLeft || 0,
      visualViewportOffsetTop: visualViewport?.offsetTop || 0
    }));
  });
}

export const hiddenSyntaxAtomicRanges = EditorView.atomicRanges.of(
  view => hiddenSyntaxRangesForView(view)
);

function cmToggleLinePrefix(view, prefix) {
  if (!view) return;
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const lineText = line.text;

  if (prefix === '') {
    const cleanText = lineText.replace(/^(#{1,6}\s+|- \[\s?[xX]?\]\s+|- |\d+\.\s+|> )/, '');
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: cleanText }
    });
    return;
  }

  if (lineText.startsWith(prefix)) {
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: '' }
    });
  } else {
    const cleanText = lineText.replace(/^(#{1,6}\s+|- \[\s?[xX]?\]\s+|- |\d+\.\s+|> )/, '');
    const newText = prefix + cleanText;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + prefix.length, head: line.from + prefix.length }
    });
  }
  view.focus();
}

function cmWrapSelection(view, before, after = before) {
  if (!view) return;
  const sel = view.state.selection.main;
  let selectedText = view.state.doc.sliceString(sel.from, sel.to);

  // Check if text is already wrapped in `before` and `after`
  if (selectedText.startsWith(before) && selectedText.endsWith(after) && selectedText.length >= before.length + after.length) {
    const unwrapped = selectedText.slice(before.length, selectedText.length - after.length);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: unwrapped },
      selection: { anchor: sel.from, head: sel.from + unwrapped.length }
    });
    view.focus();
    return;
  }

  // Trim leading/trailing whitespace to prevent user selection space formatting bugs
  let startOffset = 0;
  let endOffset = 0;
  while (startOffset < selectedText.length && /\s/.test(selectedText[startOffset])) {
    startOffset++;
  }
  while (endOffset < selectedText.length - startOffset && /\s/.test(selectedText[selectedText.length - 1 - endOffset])) {
    endOffset++;
  }

  const coreText = selectedText.slice(startOffset, selectedText.length - endOffset);
  const leadingWs = selectedText.slice(0, startOffset);
  const trailingWs = selectedText.slice(selectedText.length - endOffset);

  const replacement = leadingWs + before + coreText + after + trailingWs;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: replacement },
    selection: { anchor: sel.from + startOffset + before.length, head: sel.from + startOffset + before.length + coreText.length }
  });
  view.focus();
}

function cmIndentSelection(view, spaces = '  ') {
  if (!view) return;
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from).number;
  const endLine = view.state.doc.lineAt(sel.to).number;
  const changes = [];
  for (let i = startLine; i <= endLine; i++) {
    const l = view.state.doc.line(i);
    changes.push({ from: l.from, to: l.from, insert: spaces });
  }
  view.dispatch({ changes });
  view.focus();
}

function cmOutdentSelection(view, spaces = '  ') {
  if (!view) return;
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from).number;
  const endLine = view.state.doc.lineAt(sel.to).number;
  const changes = [];
  for (let i = startLine; i <= endLine; i++) {
    const l = view.state.doc.line(i);
    if (l.text.startsWith(spaces)) {
      changes.push({ from: l.from, to: l.from + spaces.length, insert: '' });
    }
  }
  if (changes.length > 0) {
    view.dispatch({ changes });
  }
  view.focus();
}


export function isEscapedPipe(text, index) {
  if (text[index] !== '|') return false;
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

export function trimCellRange(text, start, end, lineFrom) {
  const cellStart = start;
  const cellEnd = end;
  let contentStart = start;
  let contentEnd = end;

  while (contentStart < contentEnd && /\s/.test(text[contentStart])) {
    contentStart++;
  }
  while (contentEnd > contentStart && /\s/.test(text[contentEnd - 1])) {
    contentEnd--;
  }

  return {
    start: cellStart,
    end: cellEnd,
    from: lineFrom + cellStart,
    to: lineFrom + cellEnd,
    contentStart,
    contentEnd,
    contentFrom: lineFrom + contentStart,
    contentTo: lineFrom + contentEnd
  };
}

export function parsePipeRow(line) {
  const text = line.text;
  const pipeOffsets = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && !isEscapedPipe(text, i)) pipeOffsets.push(i);
  }
  if (pipeOffsets.length === 0) return null;

  const hasLeadingPipe = /^\s*\|/.test(text);
  const hasTrailingPipe = /\|\s*$/.test(text);
  const firstCellStart = hasLeadingPipe ? pipeOffsets[0] + 1 : 0;
  const lastCellEnd = hasTrailingPipe
    ? pipeOffsets[pipeOffsets.length - 1]
    : text.length;

  const internalPipes = pipeOffsets.filter((offset, i) =>
    !(hasLeadingPipe && i === 0) &&
    !(hasTrailingPipe && i === pipeOffsets.length - 1)
  );

  const cells = [];
  let cellStart = firstCellStart;
  for (const pipe of internalPipes) {
    cells.push(trimCellRange(text, cellStart, pipe, line.from));
    cellStart = pipe + 1;
  }
  if (lastCellEnd >= cellStart) {
    cells.push(trimCellRange(text, cellStart, lastCellEnd, line.from));
  }

  return {
    pipes: pipeOffsets.map(offset => line.from + offset),
    cells: cells.filter(cell => cell.from <= cell.to)
  };
}

export function isTableSeparatorRow(text, parsedCells) {
  return parsedCells.length > 0 &&
    parsedCells.every(({ contentStart, contentEnd }) =>
      /^:?-{3,}:?$/.test(text.slice(contentStart, contentEnd).trim())
    );
}

export function getTableColumnWidths(doc, startLine, endLine) {
  const widths = [];
  for (let number = startLine; number <= endLine; number++) {
    const line = doc.line(number);
    const parsed = parsePipeRow(line);
    if (!parsed || isTableSeparatorRow(line.text, parsed.cells)) continue;

    parsed.cells.forEach((cell, index) => {
      const text = doc.sliceString(cell.contentFrom, cell.contentTo);
      const width = Math.max(8, Math.min(40, Array.from(text).length + 2));
      widths[index] = Math.max(widths[index] || 8, width);
    });
  }
  return widths;
}

function parseTableCells(doc, startLineNum, endLineNum) {
  const cells = [];
  for (let lNum = startLineNum; lNum <= endLineNum; lNum++) {
    const line = doc.line(lNum);
    const parsed = parsePipeRow(line);
    if (!parsed) continue;
    if (isTableSeparatorRow(line.text, parsed.cells)) continue;
    for (const cell of parsed.cells) {
      cells.push({ ...cell, lineNum: lNum });
    }
  }
  return cells;
}

function navigateTableCell(view, direction) {
  const state = view.state;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const parsedLine = parsePipeRow(line);
  if (!parsedLine) return false;

  let startL = line.number;
  let endL = line.number;
  for (let l = line.number; l >= 1; l--) {
    if (parsePipeRow(state.doc.line(l))) startL = l;
    else break;
  }
  for (let l = line.number; l <= state.doc.lines; l++) {
    if (parsePipeRow(state.doc.line(l))) endL = l;
    else break;
  }

  const cells = parseTableCells(state.doc, startL, endL);
  if (cells.length === 0) return false;

  let currentIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    if (pos >= cells[i].from - 1 && pos <= cells[i].to + 1) {
      currentIdx = i;
      break;
    }
  }

  if (currentIdx === -1) return false;

  const targetIdx = currentIdx + direction;
  if (targetIdx < 0) {
    const prevLinePos = Math.max(0, state.doc.line(startL).from - 1);
    view.dispatch({ selection: { anchor: prevLinePos, head: prevLinePos }, scrollIntoView: true });
    return true;
  }
  if (targetIdx >= cells.length) {
    const nextLinePos = Math.min(state.doc.length, state.doc.line(endL).to + 1);
    view.dispatch({ selection: { anchor: nextLinePos, head: nextLinePos }, scrollIntoView: true });
    return true;
  }

  const targetCell = cells[targetIdx];
  const targetPos = direction > 0 ? targetCell.from : targetCell.to;
  view.dispatch({
    selection: { anchor: targetPos, head: targetPos },
    scrollIntoView: true
  });
  return true;
}

function isHorizontalRuleLine(state, lineNumber) {
  const line = state.doc.line(lineNumber);
  let found = false;

  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (
        node.name === 'HorizontalRule' &&
        node.from >= line.from &&
        node.to <= line.to
      ) {
        found = true;
      }
    }
  });

  return found;
}

function buildTableBlockDecorations(state) {
  if (currentEditorMode === 'source') return Decoration.none;

  const builder = [];
  const tree = syntaxTree(state);

  tree.iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      if (node.name === 'Table') {
        const tableText = state.doc.sliceString(node.from, node.to);
        const widget = new WordProcessorTableWidget(tableText, node.from, node.to);

        builder.push(Decoration.widget({
          widget,
          block: true,
          side: -1
        }).range(node.from));

        builder.push(Decoration.replace({
          block: true
        }).range(node.from, node.to));

        return false;
      }
    }
  });

  builder.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(builder, true);
}

export function updateTableDocumentSelection(view) {
  if (!view || !view.dom) return;

  const ranges = view.state.selection.ranges;
  for (const table of view.dom.querySelectorAll(
    '.cm-wp-table-container[data-table-from][data-table-to]'
  )) {
    const from = Number(table.dataset.tableFrom);
    const to = Number(table.dataset.tableTo);
    const selected =
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      ranges.some(range => !range.empty && range.from < to && range.to > from);

    table.classList.toggle('cm-document-selection', selected);
  }
}

function buildWysiwygCodeBlockDecorations(state) {
  if (currentEditorMode !== 'wysiwyg') {
    return {
      decorations: Decoration.none,
      hiddenSyntaxRanges: Decoration.none
    };
  }
  recordDecorationBuild(currentEditorMode, 'wysiwyg_code_blocks');

  const doc = state.doc;
  const builder = [];
  const hiddenSyntaxRanges = [];

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter(node) {
      if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return;

      const firstLine = doc.lineAt(node.from);
      const lastLine = doc.lineAt(node.to);

      for (let number = firstLine.number; number <= lastLine.number; number++) {
        const line = doc.line(number);
        const classes = ['cm-codeblock-line'];
        if (number === firstLine.number) classes.push('cm-codeblock-first');
        if (number === lastLine.number) classes.push('cm-codeblock-last');
        builder.push(
          Decoration.line({
            attributes: { class: classes.join(' ') }
          }).range(line.from)
        );
        const isFenceLine = /^\s*(?:`{3,}|~{3,})/.test(line.text);
        if (line.to > line.from && !isFenceLine) {
          builder.push(
            Decoration.mark({ class: 'cm-codeblock-text' })
              .range(line.from, line.to)
          );
        }
        if (
          isFenceLine &&
          number === lastLine.number &&
          number > firstLine.number &&
          line.to > line.from
        ) {
          // The opening fence is replaced by the language header below.
          // Hide the closing fence too so WYSIWYG never exposes Markdown syntax.
          const range = Decoration.replace({}).range(line.from, line.to);
          builder.push(range);
          hiddenSyntaxRanges.push(range);
        }
      }

      if (firstLine.from === node.from) {
        const codeText = doc.sliceString(node.from, node.to);
        const langMatch = firstLine.text.match(/^```(\w+)/);
        const lang = langMatch ? langMatch[1] : 'Plain text';
        const headerWidget = new CodeBlockHeaderWidget(lang, codeText);
        const headerRange = Decoration.replace({ widget: headerWidget })
          .range(firstLine.from, firstLine.to);
        builder.push(headerRange);
        hiddenSyntaxRanges.push(headerRange);
      }

      return false;
    }
  });

  builder.sort((a, b) => a.from - b.from || a.to - b.to);
  hiddenSyntaxRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    decorations: Decoration.set(builder, true),
    hiddenSyntaxRanges: Decoration.set(hiddenSyntaxRanges, true)
  };
}

function rangeTouchesSyntaxNode(state, from, to, nodeNames) {
  if (!state || !nodeNames.size) return false;
  const { doc } = state;
  const start = Math.max(0, Math.min(from, doc.length));
  const end = Math.max(start, Math.min(to, doc.length));
  const tree = syntaxTree(state);
  let found = false;

  const iterateTo = Math.min(doc.length, Math.max(start + 1, end));
  if (iterateTo > start) {
    tree.iterate({
      from: start,
      to: iterateTo,
      enter(node) {
        if (nodeNames.has(node.name)) {
          found = true;
          return false;
        }
      }
    });
  }

  if (found) return true;
  for (const position of [start, Math.max(start, end - 1)]) {
    for (let node = tree.resolveInner(position, 1); node; node = node.parent) {
      if (nodeNames.has(node.name)) return true;
    }
  }
  return false;
}

function transactionTouchesStructure(tr, {
  nodeNames = [],
  markerPattern = /[\n`~|>#*+\-[\]{}]/
} = {}) {
  if (!tr.docChanged) return false;
  const names = new Set(nodeNames);
  let structural = false;

  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (structural) return;
    const oldDoc = tr.startState.doc;
    const newDoc = tr.state.doc;
    const oldFrom = Math.max(0, Math.min(fromA, oldDoc.length));
    const oldTo = Math.max(oldFrom, Math.min(toA, oldDoc.length));
    const newFrom = Math.max(0, Math.min(fromB, newDoc.length));
    const newTo = Math.max(newFrom, Math.min(toB, newDoc.length));
    const oldText = oldDoc.sliceString(oldFrom, oldTo);
    const newText = newDoc.sliceString(newFrom, newTo);

    if (
      markerPattern.test(oldText) ||
      markerPattern.test(newText) ||
      oldDoc.lineAt(oldFrom).from === oldFrom ||
      newDoc.lineAt(newFrom).from === newFrom ||
      rangeTouchesSyntaxNode(tr.startState, oldFrom, oldTo, names) ||
      rangeTouchesSyntaxNode(tr.state, newFrom, newTo, names)
    ) {
      structural = true;
    }
  });

  return structural;
}

const wysiwygCodeBlockField = StateField.define({
  create(state) {
    return buildWysiwygCodeBlockDecorations(state);
  },
  update(current, tr) {
    const refresh = tr.effects.some(effect =>
      effect.is(heightMapRefreshEffect) || effect.is(typographySettingsEffect)
    );
    if (!tr.docChanged && !refresh) return current;
    if (
      tr.docChanged &&
      !refresh &&
      !transactionTouchesStructure(tr, {
        nodeNames: ['FencedCode', 'CodeBlock'],
        markerPattern: /[\n`~]/
      })
    ) {
      return {
        decorations: current.decorations.map(tr.changes),
        hiddenSyntaxRanges: current.hiddenSyntaxRanges.map(tr.changes)
      };
    }
    return buildWysiwygCodeBlockDecorations(tr.state);
  },
  provide: field =>
    EditorView.decorations.from(field, value => value.decorations)
});

function buildHeightMapValue(state) {
  if (currentEditorMode !== 'wysiwyg') {
    return {
      decorations: Decoration.none,
      hiddenSyntaxRanges: Decoration.none
    };
  }
  recordHeightMapRefresh(currentEditorMode, 'rebuilt');

  const doc = state.doc;
  const tree = syntaxTree(state);
  const replacements = [];
  const hiddenSyntaxRanges = [];
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (line.length === 0) {
      replacements.push(
        Decoration.widget({
          widget: emptyLineCursorAnchorWidget,
          side: 1
        }).range(line.from)
      );
    }
  }

  const hideSyntax = (from, to) => {
    if (to > from) {
      const range = Decoration.replace({}).range(from, to);
      replacements.push(range);
      hiddenSyntaxRanges.push(range);
    }
  };

  const calloutOpenerInfo = new Map();
  const processedBlockquoteLines = new Set();

  const getQuotedLineInfo = (lineNum) => {
    if (lineNum < 1 || lineNum > doc.lines) return null;
    const l = doc.line(lineNum);
    const match = l.text.match(/^(\s*(?:>\s*)+)/);
    if (!match) return null;

    const firstText = /\S/.exec(l.text);
    const probe = firstText ? l.from + firstText.index : l.from;
    const resolvedNode = tree.resolveInner(probe, 1);

    for (let ancestor = resolvedNode; ancestor; ancestor = ancestor.parent) {
      if (ancestor.name === 'FencedCode' || ancestor.name === 'CodeBlock' || ancestor.name === 'Table') {
        return null;
      }
    }

    const quotePrefix = match[1];
    const depth = (quotePrefix.match(/>/g) || []).length;
    return { line: l, quotePrefix, depth };
  };

  const isQuotedLine = (lineNum) => getQuotedLineInfo(lineNum) !== null;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    const firstText = /\S/.exec(line.text);
    const probe = firstText ? line.from + firstText.index : line.from;
    const resolvedNode = tree.resolveInner(probe, 1);

    let insideCodeBlock = false;
    let insideTable = false;

    for (let ancestor = resolvedNode; ancestor; ancestor = ancestor.parent) {
      if (ancestor.name === 'FencedCode' || ancestor.name === 'CodeBlock') insideCodeBlock = true;
      if (ancestor.name === 'Table') insideTable = true;
    }

    if (insideCodeBlock || insideTable) continue;

    const wikilinkRegex = /(?<!\!)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
    let wikilinkMatch;
    while ((wikilinkMatch = wikilinkRegex.exec(line.text)) !== null) {
      if (wikilinkMatch.index > 0 && line.text[wikilinkMatch.index - 1] === '!') continue;

      const matchStart = line.from + wikilinkMatch.index;
      const matchEnd = matchStart + wikilinkMatch[0].length;
      const target = wikilinkMatch[1];
      const alias = wikilinkMatch[2];
      const displayLabel = (alias !== undefined && alias.trim().length > 0)
        ? alias
        : (target.startsWith('#') ? target.slice(1) : target);

      replacements.push(Decoration.replace({
        widget: new WikilinkWidget(displayLabel, target)
      }).range(matchStart, matchEnd));
    }
  }

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    if (processedBlockquoteLines.has(lineNumber)) continue;

    if (isQuotedLine(lineNumber)) {
      let blockStart = lineNumber;
      while (blockStart > 1 && isQuotedLine(blockStart - 1)) {
        blockStart--;
      }

      let curLine = blockStart;
      const activeCalloutsStack = [];

      while (curLine <= doc.lines && isQuotedLine(curLine)) {
        processedBlockquoteLines.add(curLine);
        const lineInfo = getQuotedLineInfo(curLine);
        const line = lineInfo.line;
        const currentDepth = lineInfo.depth;

        while (activeCalloutsStack.length > 0 && activeCalloutsStack[activeCalloutsStack.length - 1].depth > currentDepth) {
          activeCalloutsStack.pop();
        }

        const match = line.text.match(/^(\s*(?:>\s*)+)(\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?)(?:[ \t]+(.*))?\s*$/i);

        if (match) {
          const type = match[3].toLowerCase();
          const foldMarker = match[4];
          const customTitle = match[5];
          const markerStart = line.from + match[1].length;
          const markerEnd = markerStart + match[2].length;
          const titleStart = getCalloutTitleStart(line, match);

          const calloutObj = {
            depth: currentDepth,
            type,
            openerLineNum: curLine,
            lastBodyLineNum: curLine,
            info: {
              type,
              depth: currentDepth,
              foldMarker,
              customTitle,
              markerStart,
              markerEnd,
              titleStart,
              bodyFrom: line.to,
              bodyTo: line.to
            }
          };

          activeCalloutsStack.push(calloutObj);
          calloutOpenerInfo.set(line.from, calloutObj.info);

          for (const ancestor of activeCalloutsStack) {
            if (ancestor !== calloutObj) {
              ancestor.lastBodyLineNum = curLine;
              ancestor.info.bodyTo = line.to;
            }
          }
        } else if (activeCalloutsStack.length > 0) {
          for (const calloutObj of activeCalloutsStack) {
            if (calloutObj.depth <= currentDepth) {
              calloutObj.lastBodyLineNum = curLine;
              calloutObj.info.bodyTo = line.to;
            }
          }
        }

        curLine++;
      }
    }
  }

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      const line = doc.lineAt(node.from);

      const atxHeading = /^ATXHeading([1-6])$/.exec(node.name);
      const setextHeading = /^SetextHeading([12])$/.exec(node.name);
      const headingLevel = atxHeading?.[1] ?? setextHeading?.[1];

      if (headingLevel) {
        const headingLine = doc.lineAt(node.from);
        replacements.push(
          Decoration.line({
            attributes: {
              class: `cm-heading cm-heading-${headingLevel}`
            }
          }).range(headingLine.from)
        );
      }

      if (node.name === 'HeaderMark') {
        const end = Math.min(node.to + 1, line.to);
        if (end > node.from && end <= line.to) {
          hideSyntax(node.from, end);
        }
      }

      if (node.name === 'EmphasisMark') {
        hideSyntax(node.from, node.to);
      }

      if (node.name === 'StrikethroughMark') {
        hideSyntax(node.from, node.to);
      }

      if (node.name === 'CodeMark') {
        hideSyntax(node.from, node.to);
      }

      if (node.name === 'ListMark') {
        const marker = doc.sliceString(node.from, node.to);
        const isBullet = /^[-*+]$/.test(marker.trim());
        replacements.push(Decoration.replace({
          widget: new ListMarkerWidget(marker, isBullet)
        }).range(node.from, node.to));
        const textRange = listItemTextRange(tree, doc, line, node.to);
        if (textRange) {
          replacements.push(
            Decoration.mark({ class: 'cm-list-block-text' })
              .range(textRange.from, textRange.to)
          );
        }
      }

      if (node.name === 'QuoteMark') {
        hideSyntax(node.from, Math.min(node.to + 1, line.to));
      }

      if (node.name === 'TaskMarker') {
        const taskText = doc.sliceString(node.from, node.to);
        const isChecked = taskText.toLowerCase().includes('x');
        if (node.to > node.from) {
          const range = Decoration.replace({
            widget: new CheckboxWidget(isChecked, node.from, node.to - node.from)
          }).range(node.from, node.to);
          replacements.push(range);
          hiddenSyntaxRanges.push(range);
        }
      }

      if (node.name === 'HorizontalRule') {
        if (node.to > node.from) {
          hideSyntax(node.from, node.to);
        }
      }

      if (node.name === 'Table' || node.name === 'FencedCode' || node.name === 'CodeBlock') {
        return false;
      }

      if (node.name === 'Link' || node.name === 'URL') {
        const raw = doc.sliceString(node.from, node.to);
        const match = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
          const labelFrom = node.from + 1;
          const labelTo = labelFrom + match[1].length;
          if (labelFrom > node.from) {
            hideSyntax(node.from, labelFrom);
          }
          if (node.to > labelTo) {
            hideSyntax(labelTo, node.to);
          }
        }
      }

      if (node.name === 'Image') {
        const imgText = doc.sliceString(node.from, node.to);
        const image = parseMarkdownImage(imgText);
        if (image) {
          replacements.push(Decoration.replace({
            widget: new ImagePreviewWidget(
              image.url,
              image.alt,
              node.from,
              node.to,
              image.width ?? null
            )
          }).range(node.from, node.to));
        }
      }
    }
  });

  const activeFolds = foldedRanges(state);

  for (const [lineFrom, info] of calloutOpenerInfo) {
    const hasBody = info.bodyTo > info.bodyFrom;
    const line = doc.lineAt(lineFrom);
    const customTitle = info.customTitle?.trim() || '';
    let isFolded = false;
    if (hasBody) {
      activeFolds.between(info.bodyFrom, info.bodyTo, (from, to) => {
        if (from === info.bodyFrom && to === info.bodyTo) {
          isFolded = true;
        }
      });
    }

    const displayTitle = customTitle ||
      (info.type.charAt(0).toUpperCase() + info.type.slice(1).toLowerCase());
    const titleIsInSource = info.titleStart != null;
    const widgetEnd = titleIsInSource ? info.titleStart : line.to;

    replacements.push(Decoration.replace({
      widget: new CalloutTitleWidget(
        displayTitle,
        info.type,
        info.foldMarker,
        isFolded,
        info.bodyFrom,
        info.bodyTo,
        titleIsInSource
      )
    }).range(info.markerStart, widgetEnd));

    if (titleIsInSource) {
      replacements.push(Decoration.mark({
        class: `cm-callout-title-text is-source${info.foldMarker ? ' is-foldable' : ''}`
      }).range(info.titleStart, line.to));
    }
  }

  const validReplacements = replacements.filter(d => 0 <= d.from && d.from <= d.to && d.to <= doc.length);
  validReplacements.sort((a, b) => a.from - b.from || a.to - b.to);

  const validHiddenSyntax = hiddenSyntaxRanges.filter(d => 0 <= d.from && d.from <= d.to && d.to <= doc.length);
  validHiddenSyntax.sort((a, b) => a.from - b.from || a.to - b.to);

  return {
    decorations: Decoration.set(validReplacements, true),
    hiddenSyntaxRanges: Decoration.set(validHiddenSyntax, true)
  };
}

export const heightMapField = StateField.define({
  create: buildHeightMapValue,
  update(current, tr) {
    const refresh = tr.effects.some(effect =>
      effect.is(heightMapRefreshEffect) ||
      effect.is(typographySettingsEffect)
    );
    if (!tr.docChanged && !refresh) return current;
    if (
      tr.docChanged &&
      !refresh &&
      !transactionTouchesStructure(tr, {
        nodeNames: [
          'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
          'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
          'SetextHeading1', 'SetextHeading2', 'ListItem',
          'Blockquote', 'FencedCode', 'CodeBlock', 'Table',
          'HorizontalRule', 'TaskMarker', 'Link', 'Image'
        ]
      })
    ) {
      return {
        decorations: current.decorations.map(tr.changes),
        hiddenSyntaxRanges: current.hiddenSyntaxRanges.map(tr.changes)
      };
    }
    return buildHeightMapValue(tr.state);
  },
  provide: field =>
    EditorView.decorations.from(field, value => value.decorations)
});

function premeasureTableHeights(view) {
  if (!(view.contentDOM.getBoundingClientRect().width > 0)) return;
  const decorations = view.state.field(tableStateField);
  let measuredCount = 0;
  const visited = new Set();

  decorations.between(0, view.state.doc.length, (_from, _to, decoration) => {
    const widget = decoration.spec.widget;
    if (!(widget instanceof WordProcessorTableWidget) || visited.has(widget)) return;
    visited.add(widget);
    try {
      measureTableWidgetHeight(widget, view);
      measuredCount++;
    } catch (error) {
      console.error('table_height_measure_failed', error);
    }
  });

  if (measuredCount) {
    dispatchWithScrollSnapshot(
      view,
      tableHeightEstimatesChanged.of(measuredCount)
    );
    view.requestMeasure();
  }
}

export function buildPersistentLayoutDecorations(state) {
  if (currentEditorMode === 'source') return Decoration.none;

  const { doc } = state;
  const tree = syntaxTree(state);
  const classesByLine = new Map();
  const calloutAttributesByLine = new Map();
  const activeCallouts = [];

  const addClass = (lineNumber, className) => {
    if (!classesByLine.has(lineNumber)) {
      classesByLine.set(lineNumber, new Set());
    }
    classesByLine.get(lineNumber).add(className);
  };

  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const firstText = /\S/.exec(line.text);
    const probe = firstText ? line.from + firstText.index : line.from;
    const resolved = tree.resolveInner(probe, 1);

    let paragraphNode = null;
    let insideListItem = false;
    let insideCodeBlock = false;
    let insideTable = false;
    let insideBlockquote = false;
    let headingLevel = null;
    let isHorizontalRule = false;

    for (let node = resolved; node; node = node.parent) {
      if (node.name === 'Paragraph') paragraphNode = node;
      if (node.name === 'ListItem') insideListItem = true;
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        insideCodeBlock = true;
      }
      if (node.name === 'Table') insideTable = true;
      if (node.name === 'Blockquote') insideBlockquote = true;
      if (node.name === 'HorizontalRule') isHorizontalRule = true;

      const atxHeading = /^ATXHeading([1-6])$/.exec(node.name);
      const setextHeading = /^SetextHeading([12])$/.exec(node.name);
      headingLevel = headingLevel ?? atxHeading?.[1] ?? setextHeading?.[1] ?? null;
    }

    // These blocks already have their own full-document decoration fields.
    if (insideTable || insideCodeBlock) continue;

    let calloutInfo = null;
    const quotePrefix = line.text.match(/^(\s*(?:>\s*)+)/);
    if (!insideBlockquote || !quotePrefix) {
      activeCallouts.length = 0;
    } else {
      const depth = (quotePrefix[1].match(/>/g) || []).length;
      while (
        activeCallouts.length > 0 &&
        activeCallouts[activeCallouts.length - 1].depth > depth
      ) {
        activeCallouts.pop();
      }

      const opener = line.text.match(
        /^(\s*(?:>\s*)+)\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?(?:[ \t]+(.*))?\s*$/i
      );
      if (opener) {
        calloutInfo = {
          type: opener[2].toLowerCase(),
          depth,
          isTitle: true
        };
        activeCallouts.push(calloutInfo);
      } else {
        const currentCallout = activeCallouts[activeCallouts.length - 1];
        if (currentCallout && currentCallout.depth <= depth) {
          calloutInfo = {
            type: currentCallout.type,
            depth: currentCallout.depth,
            isTitle: false
          };
        }
      }
    }

    if (headingLevel) {
      addClass(number, 'cm-heading');
      addClass(number, `cm-heading-${headingLevel}`);
    }
    if (calloutInfo) {
      addClass(number, 'cm-callout');
      if (calloutInfo.isTitle) {
        addClass(number, 'cm-callout-title');
        addClass(number, 'cm-callout-title-rendered');
      } else {
        addClass(number, 'cm-callout-body');
      }
      calloutAttributesByLine.set(number, {
        type: calloutInfo.type,
        depth: calloutInfo.depth
      });
    } else if (insideBlockquote) {
      addClass(number, 'cm-blockquote');
    }
    if (isHorizontalRule) addClass(number, 'cm-hr');

    const hasListMarker = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?\s+/.test(line.text);
    if (calloutInfo) {
      if (hasListMarker) {
        addClass(number, 'cm-list-item');
        addClass(number, 'cm-callout-list-item');
      }
      if (/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line.text)) {
        addClass(number, 'cm-todo-list-item');
      }
      continue;
    }
    if (insideListItem) {
      addClass(number, 'cm-list-item');
      if (/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line.text)) {
        addClass(number, 'cm-todo-list-item');
      }
      continue;
    }

    if (paragraphNode) {
      addClass(number, 'cm-paragraph');
      if (line.from === doc.lineAt(paragraphNode.from).from) {
        addClass(number, 'cm-paragraph-first');
      }
      if (
        line.from ===
        doc.lineAt(Math.max(paragraphNode.from, paragraphNode.to - 1)).from
      ) {
        addClass(number, 'cm-paragraph-last');
      }
    }
  }

  const ranges = [];
  for (const [lineNumber, classes] of classesByLine) {
    const lineObj = doc.line(lineNumber);
    const calloutAttributes = calloutAttributesByLine.get(lineNumber);
    ranges.push(
      Decoration.line({
        attributes: {
          class: [...classes].join(' '),
          ...(calloutAttributes
            ? {
                'data-callout-type': calloutAttributes.type,
                'data-callout-depth': String(calloutAttributes.depth),
                style: `--callout-depth-offset:${Math.max(0, calloutAttributes.depth - 1) * 12}px`
              }
            : {})
        }
      }).range(lineObj.from)
    );
  }

  ranges.sort((a, b) => a.from - b.from);
  return Decoration.set(ranges, true);
}

export const persistentLayoutField = StateField.define({
  create(state) {
    return buildPersistentLayoutDecorations(state);
  },
  update(current, tr) {
    const refresh = tr.effects.some(effect =>
      effect.is(typographySettingsEffect) ||
      effect.is(heightMapRefreshEffect)
    );
    if (!tr.docChanged && !refresh) return current;
    if (
      tr.docChanged &&
      !refresh &&
      !transactionTouchesStructure(tr, {
        nodeNames: [
          'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
          'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
          'SetextHeading1', 'SetextHeading2', 'ListItem',
          'Blockquote', 'FencedCode', 'CodeBlock', 'Table',
          'HorizontalRule'
        ]
      })
    ) {
      return current.map(tr.changes);
    }
    return buildPersistentLayoutDecorations(tr.state);
  },
  provide: field => EditorView.decorations.from(field)
});

export const tableStateField = StateField.define({
  create(state) {
    return buildTableBlockDecorations(state);
  },
  update(current, tr) {
    const refresh = tr.effects.some(effect =>
      effect.is(tableHeightEstimatesChanged) ||
      effect.is(heightMapRefreshEffect) ||
      effect.is(typographySettingsEffect)
    );
    if (!tr.docChanged && !refresh) return current;
    if (
      tr.docChanged &&
      !refresh &&
      !transactionTouchesStructure(tr, {
        nodeNames: ['Table'],
        markerPattern: /[\n|]/
      })
    ) {
      return current.map(tr.changes);
    }
    return buildTableBlockDecorations(tr.state);
  },
  provide: field => EditorView.decorations.from(field)
});


export const tableNavigationKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => navigateTableCell(view, 1)
  },
  {
    key: 'Shift-Tab',
    run: (view) => navigateTableCell(view, -1)
  }
]);

const renderedVerticalGoals = new WeakMap();

function renderedVisualRows(view) {
  const rows = [];
  const lineElements = Array.from(view.contentDOM.children)
    .filter(element => element.classList?.contains('cm-line'));

  for (const line of lineElements) {
    const ownerDocument = line.ownerDocument;
    const showText = ownerDocument.defaultView.NodeFilter.SHOW_TEXT;
    const walker = ownerDocument.createTreeWalker(line, showText);
    const fragments = [];
    let textNode;

    while ((textNode = walker.nextNode())) {
      if (textNode.parentElement?.closest('.cm-codeblock-header')) continue;

      const textRange = ownerDocument.createRange();
      textRange.selectNodeContents(textNode);
      fragments.push(
        ...Array.from(textRange.getClientRects()).filter(rect => rect.height > 0)
      );
    }

    const addFragment = rect => {
      let row = rows.find(candidate => {
        if (candidate.element !== line) return false;
        const overlap = Math.min(candidate.bottom, rect.bottom) -
          Math.max(candidate.top, rect.top);
        return overlap > 0 ||
          Math.abs(candidate.center - (rect.top + rect.bottom) / 2) <= 1;
      });

      if (!row) {
        row = {
          element: line,
          top: rect.top,
          bottom: rect.bottom,
          center: (rect.top + rect.bottom) / 2
        };
        rows.push(row);
        return;
      }

      row.top = Math.min(row.top, rect.top);
      row.bottom = Math.max(row.bottom, rect.bottom);
      row.center = (row.top + row.bottom) / 2;
    };

    if (fragments.length) {
      for (const rect of fragments) addFragment(rect);
    } else if (!line.querySelector('.cm-codeblock-header')) {
      // Empty Markdown lines and fully hidden syntax still occupy a visual row.
      const rect = line.getBoundingClientRect();
      if (rect.height > 0) addFragment(rect);
    }
  }

  return rows.sort((a, b) => a.center - b.center);
}

function renderedLineForPosition(view, position, side) {
  const located = view.domAtPos(position, side);
  const element = located.node?.nodeType === 1
    ? located.node
    : located.node?.parentElement;
  return element?.closest?.('.cm-line') || null;
}

function leaveHiddenSyntax(view, position, direction) {
  const ranges = hiddenSyntaxRangesForView(view);
  if (!ranges || position >= view.state.doc.length) return position;

  let result = position;
  ranges.between(position, position + 1, (from, to) => {
    if (from <= position && position < to) {
      result = direction > 0 ? to : from;
    }
  });
  return result;
}

function positionOnRenderedRow(view, row, goalX, direction) {
  const coordsForTargetRow = position => {
    const matches = [];
    for (const side of [-1, 1]) {
      const coords = view.coordsAtPos(position, side);
      if (!coords) continue;

      const center = (coords.top + coords.bottom) / 2;
      if (center >= row.top - 2 && center <= row.bottom + 2) {
        matches.push(coords);
      }
    }
    return matches;
  };

  const direct = view.posAtCoords({ x: goalX, y: row.center });
  const directLine = direct == null
    ? null
    : renderedLineForPosition(view, direct, direction);
  const directRowCoords = direct == null ? [] : coordsForTargetRow(direct);

  if (
    direct != null &&
    directLine === row.element &&
    directRowCoords.length > 0
  ) {
    return direct;
  }

  // Android WebView can map a point over hidden Markdown delimiters to a
  // different source line. Search only this rendered row's source line and
  // choose the caret position whose measured x is nearest the saved goal.
  const lineStart = view.posAtDOM(row.element, 0);
  const line = view.state.doc.lineAt(lineStart);
  let bestPosition = null;
  let bestDistance = Infinity;

  for (let position = line.from; position <= line.to; position++) {
    for (const coords of coordsForTargetRow(position)) {
      const distance = Math.abs(coords.left - goalX);
      if (distance < bestDistance) {
        bestPosition = position;
        bestDistance = distance;
      }
    }
  }

  return bestPosition;
}

export function moveByRenderedRow(view, direction, extendSelection = false) {
  if (!view.dom.isConnected || view.state.selection.ranges.length !== 1) {
    return false;
  }

  const range = view.state.selection.main;
  const start = extendSelection || range.empty
    ? range.head
    : direction < 0 ? range.from : range.to;
  const caret = view.coordsAtPos(start);
  if (!caret) return false;

  const rows = renderedVisualRows(view);
  const currentLine = renderedLineForPosition(view, start, direction);
  if (!currentLine || !rows.length) return false;

  const caretCenter = (caret.top + caret.bottom) / 2;
  let currentIndex = -1;
  let nearestDistance = Infinity;
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].element !== currentLine) continue;
    const distance = Math.abs(rows[index].center - caretCenter);
    if (distance < nearestDistance) {
      currentIndex = index;
      nearestDistance = distance;
    }
  }
  if (currentIndex < 0) return false;

  const previousGoal = renderedVerticalGoals.get(view);
  const preserveGoal = range.empty && previousGoal?.head === start;
  const goalX = preserveGoal ? previousGoal.x : caret.left;
  const targetRow = rows[currentIndex + direction];
  if (!targetRow) return false;

  let target = positionOnRenderedRow(view, targetRow, goalX, direction);
  if (target == null) return false;
  target = leaveHiddenSyntax(view, target, direction);

  // Do not dispatch if the browser mapped the target point to a different row.
  const mappedLine = renderedLineForPosition(view, target, direction);
  if (mappedLine && mappedLine !== targetRow.element) return false;

  const selection = extendSelection
    ? { anchor: range.anchor, head: target }
    : { anchor: target, head: target };
  view.dispatch({
    selection,
    scrollIntoView: true,
    userEvent: extendSelection ? 'select' : 'move'
  });

  renderedVerticalGoals.set(view, {
    x: goalX,
    head: view.state.selection.main.head
  });
  return true;
}

export const renderedRowNavigationKeymap = keymap.of([
  {
    key: 'ArrowUp',
    run: view => moveByRenderedRow(view, -1),
    shift: view => moveByRenderedRow(view, -1, true)
  },
  {
    key: 'ArrowDown',
    run: view => moveByRenderedRow(view, 1),
    shift: view => moveByRenderedRow(view, 1, true)
  }
]);

export const resetRenderedVerticalGoal = EditorView.domEventHandlers({
  pointerdown(event, view) {
    if (event.target?.closest?.('.cm-image-preview-wrapper')) return true;
    renderedVerticalGoals.delete(view);
    return false;
  },
  click(event) {
    return Boolean(event.target?.closest?.('.cm-image-preview-wrapper'));
  },
  contextmenu(event) {
    if (!event.target?.closest?.('.cm-image-preview-wrapper')) return false;
    event.preventDefault();
    return true;
  }
});




class CodeMirrorAdapter {
  constructor() {
    this.mode = currentEditorMode;
    this.documentSessionId = window.AndroidNative?.getCurrentDocumentSessionId?.() || null;
    this.view = null;
    this.lineWrapCompartment = new Compartment();
    this.lineNumbersCompartment = new Compartment();
    this.showLineNumbers = false;
    this.revision = 0;
    this.isProgrammatic = false;
    this.scrollPersistTimer = null;
    this.scrollPersistHandler = null;
    this.visibilityPersistHandler = null;
    this.pageHidePersistHandler = null;
    this.syntaxRefreshFrame = null;
    this.syntaxRefreshAttempts = 0;
    this.syntaxRefreshComplete = false;
    this.pendingRestoreScrollTop = null;
  }

  scheduleSyntaxRefresh() {
    const view = this.view;
    if (!view) return;

    if (this.syntaxRefreshFrame !== null) {
      cancelAnimationFrame(this.syntaxRefreshFrame);
      this.syntaxRefreshFrame = null;
    }
    this.syntaxRefreshAttempts = 0;
    this.syntaxRefreshComplete = false;

    const refresh = () => {
      if (this.view !== view || !view.dom.isConnected) return;

      if (currentEditorMode === 'source') {
        this.syntaxRefreshComplete = true;
        this.syntaxRefreshFrame = null;
        this.scheduleRestoredScrollTop();
        return;
      }

      const parsed = forceParsing(view, view.state.doc.length, 8);
      if (parsed) {
        dispatchWithScrollSnapshot(
          view,
          heightMapRefreshEffect.of(null)
        );
        this.syntaxRefreshComplete = true;
        this.syntaxRefreshFrame = null;
        this.scheduleRestoredScrollTop();
        return;
      }

      this.syntaxRefreshAttempts += 1;
      if (this.syntaxRefreshAttempts >= 120) {
        window.AndroidNative?.reportDiagnostic?.(
          'syntax_parse_timeout',
          this.syntaxRefreshAttempts
        );
        dispatchWithScrollSnapshot(
          view,
          heightMapRefreshEffect.of(null)
        );
        this.syntaxRefreshComplete = true;
        this.syntaxRefreshFrame = null;
        this.scheduleRestoredScrollTop();
        return;
      }

      this.syntaxRefreshFrame = requestAnimationFrame(refresh);
    };

    this.syntaxRefreshFrame = requestAnimationFrame(refresh);
  }

  setScrollPosition(scrollTop) {
    if (!Number.isFinite(scrollTop) || scrollTop < 0) return;
    this.pendingRestoreScrollTop = scrollTop;
    if (this.syntaxRefreshComplete) this.scheduleRestoredScrollTop();
  }

  getScrollPosition() {
    const scrollTop = this.view?.scrollDOM?.scrollTop;
    return Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : null;
  }

  scheduleRestoredScrollTop() {
    const view = this.view;
    const scrollTop = this.pendingRestoreScrollTop;
    if (!view || scrollTop == null || !this.syntaxRefreshComplete) return;

    this.pendingRestoreScrollTop = null;
    requestAnimationFrame(() => {
      if (this.view !== view || !view.dom.isConnected) return;
      view.scrollDOM.scrollTop = scrollTop;
    });
  }

  persistScrollPosition(documentSessionId = this.documentSessionId) {
    if (this.scrollPersistTimer !== null) {
      clearTimeout(this.scrollPersistTimer);
      this.scrollPersistTimer = null;
    }
    if (!this.view || this.isProgrammatic) return;

    const bridge = window.AndroidNative;
    if (typeof bridge?.onScrollChanged !== 'function') return;

    bridge.onScrollChanged(
      Math.max(0, Math.round(this.view.scrollDOM.scrollTop)),
      documentSessionId
    );
  }

  queueScrollPositionSave() {
    if (!this.view || this.isProgrammatic) return;
    if (this.scrollPersistTimer !== null) {
      clearTimeout(this.scrollPersistTimer);
    }

    const documentSessionId = this.documentSessionId;
    this.scrollPersistTimer = setTimeout(() => {
      this.scrollPersistTimer = null;
      this.persistScrollPosition(documentSessionId);
    }, 250);
    if (this.scrollPersistTimer && typeof this.scrollPersistTimer.unref === 'function') {
      this.scrollPersistTimer.unref();
    }
  }

  async init(containerEl, initialMarkdown = '', modeSnapshot = null) {
    containerEl.innerHTML = '';
    let startState = EditorState.create({
      doc: initialMarkdown || '',
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        codeFolding(),
        cmMarkdown({ extensions: [GFM, GFMTable, GFMStrikethrough, GFMTaskList] }),
        syntaxHighlighting(customHighlightStyle),
        livePreviewPlugin,
        listMarkerMeasurementPlugin,
        hiddenSyntaxAtomicRanges,
        EditorState.transactionFilter.of(transaction => {
          if (
            currentEditorMode !== 'wysiwyg' ||
            transaction.docChanged ||
            !transaction.selection
          ) {
            return transaction;
          }
          return filterSelectionOutsideHiddenSyntax(
            transaction,
            hiddenSyntaxRangesForState(transaction.startState),
            transaction.newDoc.length
          );
        }),
        this.lineWrapCompartment.of(isLineWrapEnabled ? EditorView.lineWrapping : []),
        this.lineNumbersCompartment.of(this.showLineNumbers ? lineNumbers() : []),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: 'var(--body-font-size, 16px)',
            fontFamily: 'var(--body-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
            backgroundColor: 'var(--bg-color, #000000)',
            color: 'var(--text-color, #ffffff)'
          },
          '.cm-content': {
            caretColor: 'var(--text-color, #ffffff) !important',
            fontFamily: 'var(--body-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
            padding: '12px 16px',
            lineHeight: 'var(--paragraph-line-height, 1.6)',
            color: 'var(--text-color, #ffffff) !important'
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeft: 'var(--cursor-width, 2px) solid var(--cursor-color, var(--text-color, #ffffff)) !important',
            animation: 'cm-blink var(--cursor-blink-rate, 0.8s) infinite'
          },
          '.cm-selectionBackground, ::selection': {
            backgroundColor: 'var(--selection-highlight-bg, rgba(0, 120, 212, 0.4)) !important',
            color: 'var(--selection-highlight-text, inherit) !important'
          },
          '.cm-selectionLayer': {
            zIndex: 2,
            pointerEvents: 'none'
          },
          '.cm-line': {
            color: 'var(--text-color, #ffffff) !important'
          },
          '&.cm-focused': {
            outline: 'none'
          }
        }),
        search({
          createPanel: () => {
            const container = document.querySelector('#custom-search-bar');
            return {
              dom: container,
              top: true
            };
          }
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !this.isProgrammatic) {
            this.revision++;
            window.leftPanelController?.onEditorChanged?.(update.state.doc.toString());
            if (window.AndroidNative && typeof window.AndroidNative.onContentChanged === 'function') {
              window.AndroidNative.onContentChanged(
                update.state.doc.toString(),
                this.revision,
                this.documentSessionId
              );
            } else if (window.AndroidNative && typeof window.AndroidNative.onDirtyStateChanged === 'function') {
              window.AndroidNative.onDirtyStateChanged(true, this.revision, this.documentSessionId);
            }
          }
          if (update.selectionSet || update.docChanged || update.viewportChanged) {
            updateTableDocumentSelection(update.view);
            updateFloatingSelectionToolbar(update.view);
          }
          if (update.selectionSet || update.docChanged || update.viewportChanged) {
            scheduleNativeCursorAnchor(update.view);
          }
          if (update.selectionSet || update.docChanged) {
            refreshToolbarSyntaxState(update.view);
          }
          if ((update.selectionSet || update.docChanged) && typeof updateTocActiveSection === 'function') {
            updateTocActiveSection();
          }
          if (update.docChanged && typeof refreshOpenTocPanel === 'function') {
            refreshOpenTocPanel();
          }
        }),
        tableStateField,
        wysiwygCodeBlockField,
        footnoteStateField,
        persistentLayoutField,
        heightMapField,
        tableNavigationKeymap,
        renderedRowNavigationKeymap,
        resetRenderedVerticalGoal,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap
        ])
      ]
    });

    if (modeSnapshot?.selection) {
      let selection = modeSnapshot.selection;

      if (currentEditorMode === 'wysiwyg') {
        const hiddenRanges = [];
        const hiddenSyntax = mergeHiddenSyntaxRanges(
          startState.doc.length,
          startState.field(heightMapField).hiddenSyntaxRanges,
          startState.field(wysiwygCodeBlockField, false)?.hiddenSyntaxRanges,
          startState.field(footnoteStateField, false)?.hiddenSyntaxRanges
        );
        hiddenSyntax.between(0, startState.doc.length, (from, to) => {
          hiddenRanges.push({ from, to });
        });
        selection = mapSelectionOutsideHiddenSyntax(
          selection,
          hiddenRanges,
          startState.doc.length
        );
      }

      startState = startState.update({ selection }).state;
    }

    this.view = new EditorView({
      state: startState,
      parent: containerEl,
      scrollTo: modeSnapshot?.scroll
    });

    let editorTapStart = null;
    this.view.contentDOM.addEventListener('pointerdown', event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
        editorTapStart = null;
        return;
      }
      editorTapStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
    }, { capture: true });
    this.view.contentDOM.addEventListener('pointerup', event => {
      const start = editorTapStart;
      editorTapStart = null;
      if (
        !start ||
        start.pointerId !== event.pointerId ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
      ) {
        return;
      }
      requestAnimationFrame(() => {
        if (this.view?.dom.isConnected && this.view.hasFocus) {
          window.AndroidNative?.showEditorKeyboard?.();
        }
      });
    }, { capture: true });
    this.view.contentDOM.addEventListener('pointercancel', () => {
      editorTapStart = null;
    }, { capture: true });

    this.view.scrollDOM.style.overflowAnchor = 'auto';
    this.scrollPersistHandler = () => this.queueScrollPositionSave();
    this.visibilityPersistHandler = () => {
      if (document.visibilityState === 'hidden') this.persistScrollPosition();
    };
    this.pageHidePersistHandler = () => this.persistScrollPosition();

    this.view.scrollDOM.addEventListener(
      'scroll',
      this.scrollPersistHandler,
      { passive: true }
    );
    document.addEventListener(
      'visibilitychange',
      this.visibilityPersistHandler
    );
    window.addEventListener('pagehide', this.pageHidePersistHandler);

    premeasureTableHeights(this.view);

    this.lastTableContentWidth = Math.round(
      this.view.contentDOM.getBoundingClientRect().width
    );
    this.tableWidthMeasureFrame = null;
    this.tableContentWidthObserver = new ResizeObserver(() => {
      if (!this.view) return;
      const observedWidth = Math.round(
        this.view.contentDOM.getBoundingClientRect().width
      );
      if (
        observedWidth <= 0 ||
        observedWidth === this.lastTableContentWidth ||
        this.tableWidthMeasureFrame !== null
      ) {
        return;
      }

      this.tableWidthMeasureFrame = requestAnimationFrame(() => {
        this.tableWidthMeasureFrame = null;
        if (!this.view || !this.view.dom.isConnected) return;

        const currentWidth = Math.round(
          this.view.contentDOM.getBoundingClientRect().width
        );
        if (currentWidth <= 0 || currentWidth === this.lastTableContentWidth) return;

        this.lastTableContentWidth = currentWidth;
        premeasureTableHeights(this.view);
        dispatchWithScrollSnapshot(
          this.view,
          heightMapRefreshEffect.of(null)
        );
      });
    });
    this.tableContentWidthObserver.observe(this.view.contentDOM);

    updateTableDocumentSelection(this.view);
    this.navigationDiagnosticsCleanup = null;
    this.setNavigationDiagnosticsEnabled(
      window.AndroidNative?.isNavigationCaptureActive?.() === true
    );

        setupGroupedControlBar();
    refreshToolbarSyntaxState(this.view);
    initCustomSearchBar();
    this.fastScrollbarCleanup = setupFastScrollbar();
    this.tocGestureCleanup = setupTocGestureAndPanel(this.view.scrollDOM);

    this.scheduleSyntaxRefresh();
  }

  setMarkdown(text) {
    if (!this.view) return;
    if (this.scrollPersistTimer !== null) {
      clearTimeout(this.scrollPersistTimer);
      this.scrollPersistTimer = null;
    }
    this.documentSessionId =
      window.AndroidNative?.getCurrentDocumentSessionId?.() || this.documentSessionId;
    this.isProgrammatic = true;
    const currentDoc = this.view.state.doc.toString();
    if (currentDoc !== text) {
      this.view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: text || '' },
        annotations: Transaction.addToHistory.of(false)
      });
      this.scheduleSyntaxRefresh();
    }
    this.revision = 0;
    const timer = setTimeout(() => { this.isProgrammatic = false; }, 20);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  setNavigationDiagnosticsEnabled(enabled) {
    if (!this.view) return;
    if (enabled && !this.navigationDiagnosticsCleanup) {
      this.navigationDiagnosticsCleanup = setupNavigationDiagnostics(this.view);
    } else if (!enabled && this.navigationDiagnosticsCleanup) {
      this.navigationDiagnosticsCleanup();
      this.navigationDiagnosticsCleanup = null;
    }
  }

  getMarkdown() {
    if (!this.view) return '';
    return this.view.state.doc.toString();
  }


  undo() {
    if (this.view && typeof undoDepth === 'function' && undoDepth(this.view.state) > 0) {
      cmUndo(this.view);
    }
  }

  redo() {
    if (this.view && typeof redoDepth === 'function' && redoDepth(this.view.state) > 0) {
      cmRedo(this.view);
    }
  }

  setLineWrap(enabled) {
    if (!this.view) return;
    this.view.dispatch({
      effects: this.lineWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : [])
    });
  }

  toggleLineNumbers() {
    if (!this.view) return false;
    this.showLineNumbers = !this.showLineNumbers;
    const cmEl = this.view.dom;
    if (cmEl) {
      if (this.showLineNumbers) {
        cmEl.classList.add('cm-show-line-numbers');
      } else {
        cmEl.classList.remove('cm-show-line-numbers');
      }
    }
    this.view.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(this.showLineNumbers ? lineNumbers() : [])
    });
    return this.showLineNumbers;
  }

  insertImage(imageUrl, altText = 'image') {
    if (this.view) {
      const imgMarkdown = `![${altText}](${imageUrl})`;
      const sel = this.view.state.selection.main;
      this.view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: imgMarkdown },
        selection: { anchor: sel.from + imgMarkdown.length, head: sel.from + imgMarkdown.length }
      });
      this.view.focus();
    }
  }

  destroy() {
    this.persistScrollPosition();

    if (this.syntaxRefreshFrame !== null) {
      cancelAnimationFrame(this.syntaxRefreshFrame);
      this.syntaxRefreshFrame = null;
    }

    if (this.view && this.scrollPersistHandler) {
      this.view.scrollDOM.removeEventListener(
        'scroll',
        this.scrollPersistHandler
      );
    }
    if (this.visibilityPersistHandler) {
      document.removeEventListener(
        'visibilitychange',
        this.visibilityPersistHandler
      );
    }
    if (this.pageHidePersistHandler) {
      window.removeEventListener('pagehide', this.pageHidePersistHandler);
    }

    this.tableContentWidthObserver?.disconnect();
    this.tableContentWidthObserver = null;
    if (this.tableWidthMeasureFrame !== null) {
      cancelAnimationFrame(this.tableWidthMeasureFrame);
      this.tableWidthMeasureFrame = null;
    }
    if (typeof this.navigationDiagnosticsCleanup === 'function') {
      this.navigationDiagnosticsCleanup();
      this.navigationDiagnosticsCleanup = null;
    }
    for (const cleanupKey of ['fastScrollbarCleanup', 'tocGestureCleanup']) {
      if (typeof this[cleanupKey] === 'function') {
        this[cleanupKey]();
        this[cleanupKey] = null;
      }
    }

    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
  }
}

async function setEditorMode(mode) {
  const targetMode = (mode === 'live_preview' || mode === 'source') ? mode : 'wysiwyg';

  const existingText = activeAdapter ? activeAdapter.getMarkdown() : (pendingMarkdown || '');

  const modeSnapshot = activeAdapter?.view
    ? {
        selection: activeAdapter.view.state.selection,
        scroll: activeAdapter.view.scrollSnapshot()
      }
    : null;

  if (activeAdapter) {
    activeAdapter.destroy();
    activeAdapter = null;
    pendingMarkdown = null;
  }

  currentEditorMode = targetMode;
  const container = document.querySelector('#editor-container');
  if (container) {
    let editorEl = container.querySelector('#editor');
    if (!editorEl) {
      editorEl = document.createElement('div');
      editorEl.id = 'editor';
      container.appendChild(editorEl);
    } else {
      editorEl.innerHTML = '';
    }
  }

  const adapter = new CodeMirrorAdapter();
  const containerEl = document.querySelector('#editor');
  await adapter.init(containerEl, existingText, modeSnapshot);
  activeAdapter = adapter;
  if (pendingMarkdown !== null) {
    const latestPendingMarkdown = pendingMarkdown;
    pendingMarkdown = null;
    window.editorBridge?.setMarkdown?.(latestPendingMarkdown);
  }

  if (document.querySelector('#toc-panel')?.classList.contains('open')) {
    tocExpansionState.centerOnNextUpdate = true;
    updateTocActiveSection();
    refreshOpenTocPanel?.();
    requestAnimationFrame(() => {
      if (activeAdapter === adapter) updateTocActiveSection();
    });
  }

  if (window.AndroidNative && typeof window.AndroidNative.onEditorReady === 'function') {
    window.AndroidNative.onEditorReady(targetMode);
  }

  return activeAdapter;
}

function installToolbarTapActions(container) {
  if (!container || container.dataset.toolbarTapActionsInstalled === 'true') return;
  container.dataset.toolbarTapActionsInstalled = 'true';
  const pendingTaps = new WeakMap();
  container.addEventListener('click', event => {
    const target = event.target?.nodeType === 1
      ? event.target
      : event.target?.parentElement;
    const button = target?.closest?.('[data-toolbar-key], [data-toolbar-style-id]');
    if (!button || !container.contains(button)) return;
    if (button.dataset.toolbarGestureSuppressClick === 'true') {
      delete button.dataset.toolbarGestureSuppressClick;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (button.dataset.toolbarTapReplay === 'true') {
      delete button.dataset.toolbarTapReplay;
      return;
    }
    const id = button.dataset.toolbarKey || button.dataset.toolbarStyleId;
    const toolbarConfig = getToolbarConfigForElement(button);
    const actions = toolbarConfig.styles[id]?.gestureActions || {};
    const hasTap1 = Boolean(actions.tap1);
    const hasTap2 = Boolean(actions.tap2);
    const hasTap3 = Boolean(actions.tap3);
    if (!hasTap1 && !hasTap2 && !hasTap3) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const state = pendingTaps.get(button) || { count: 0, timer: null };
    if (state.timer) clearTimeout(state.timer);
    state.count += 1;

    const fallback = () => {
      if (hasTap1) runToolbarGestureAction(actions.tap1, button, new Set(), toolbarConfig);
      else {
        button.dataset.toolbarTapReplay = 'true';
        button.click();
      }
    };
    const finish = () => {
      const actionId = actions[`tap${state.count}`];
      if (actionId) runToolbarGestureAction(actionId, button, new Set(), toolbarConfig);
      else fallback();
      pendingTaps.delete(button);
    };

    if (state.count >= 3) {
      if (state.timer) clearTimeout(state.timer);
      if (hasTap3) runToolbarGestureAction(actions.tap3, button, new Set(), toolbarConfig);
      else if (hasTap2) runToolbarGestureAction(actions.tap2, button, new Set(), toolbarConfig);
      else fallback();
      pendingTaps.delete(button);
      return;
    }
    if (state.count === 2 && hasTap2 && !hasTap3) {
      runToolbarGestureAction(actions.tap2, button, new Set(), toolbarConfig);
      pendingTaps.delete(button);
      return;
    }
    if (state.count === 1 && !hasTap2 && !hasTap3) {
      runToolbarGestureAction(actions.tap1, button, new Set(), toolbarConfig);
      pendingTaps.delete(button);
      return;
    }
    state.timer = setTimeout(finish, 300);
    pendingTaps.set(button, state);
  }, true);
}

function setupGroupedControlBar() {
  const topContainer = document.querySelector('#editor-container');
  if (!topContainer) return;

  let bar = document.querySelector('#bottom-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bottom-toolbar';
    bar.className = 'grouped-control-bar bottom-toolbar-bar';
    topContainer.appendChild(bar);
  }
  installToolbarTapActions(bar);

  const toolbarActionRegistry = createRuntimeToolbarItemRegistry();
  const toolbarDefinitions = Object.fromEntries(
    [...toolbarActionRegistry].map(([id, item]) => [
      id,
      { id, title: item.title, icon: item.icon, kind: 'action' }
    ])
  );
  renderBottomToolbarKeys(bar, bottomToolbarConfig, svgIcons, {
    resolveCustomIcon: style => style.customSvg || '',
    definitions: toolbarDefinitions,
    resolveGestureActionIcon: (actionId, customSvg) => {
      if (customSvg) return sanitizeToolbarSvg(customSvg, false);
      const icon = toolbarActionRegistry.get(actionId)?.icon;
      return typeof icon === 'string' && icon.includes('<svg')
        ? icon
        : svgIcons[icon] || icon || '';
    },
    onGesture: (id, gestureId, event, button) => {
      const actionId = getToolbarGestureActionId(
        bottomToolbarConfig.styles[id],
        gestureId
      );
      return actionId ? runToolbarGestureAction(actionId, button) : false;
    },
    onKeyClick: (id, event) => {
      if (!bottomToolbarConfig.customKeys?.[id]) return;
      event.preventDefault();
      event.stopPropagation();
      runToolbarGestureAction(id, event.currentTarget);
    }
  });

  const undoBtn = bar.querySelector('#grp-btn-undo');
  if (undoBtn) {
    undoBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeAdapter) activeAdapter.undo();
    };
  }

  if (!document.__wmdxToolbarOutsideClickInstalled) {
    document.addEventListener('click', (e) => {
      const strip = document.querySelector('#popup-toolbar-strip');
      const bars = [
        document.querySelector('#bottom-toolbar'),
        document.querySelector('#floating-selection-toolbar')
      ].filter(Boolean);
      if (strip && !strip.classList.contains('hidden')) {
        if (!strip.contains(e.target) && !bars.some(barEl => barEl.contains(e.target))) {
          hidePopupStrip();
        }
      }
    });
    document.__wmdxToolbarOutsideClickInstalled = true;
  }

  setupFloatingSelectionToolbar();

  const headingBtn = bar.querySelector('#grp-btn-heading');
  if (headingBtn) {
    headingBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('heading', headingBtn, [
        { id: 'paragraph', title: 'Paragraph', icon: 'P', command: 'paragraph', action: () => execCmd('heading', { value: 'paragraph' }) },
        { title: 'Heading 1', icon: 'H1', command: 'heading1', action: () => execCmd('heading', { value: 'heading1' }) },
        { title: 'Heading 2', icon: 'H2', command: 'heading2', action: () => execCmd('heading', { value: 'heading2' }) },
        { title: 'Heading 3', icon: 'H3', command: 'heading3', action: () => execCmd('heading', { value: 'heading3' }) },
        { title: 'Heading 4', icon: 'H4', command: 'heading4', action: () => execCmd('heading', { value: 'heading4' }) },
        { title: 'Heading 5', icon: 'H5', command: 'heading5', action: () => execCmd('heading', { value: 'heading5' }) },
        { title: 'Heading 6', icon: 'H6', command: 'heading6', action: () => execCmd('heading', { value: 'heading6' }) },
        { id: 'autoHeading', title: 'Auto Heading', icon: svgIcons.autoHeading, command: 'autoHeading', action: () => execCmd('autoHeading') },
        { id: 'wrap', icon: svgIcons.wrap, title: 'Toggle Line Wrap', action: () => window.editorBridge.toggleLineWrap() },
        { id: 'line-numbers', icon: '#', title: 'Toggle Line Numbers', action: () => window.editorBridge.toggleLineNumbers() }
      ]);
    };
  }

  const listsBtn = bar.querySelector('#grp-btn-lists');
  if (listsBtn) {
    listsBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('lists', listsBtn, [
        { title: 'Bulleted List', icon: svgIcons.bulletedList, command: 'bulletedList', action: () => execCmd('bulletedList') },
        { title: 'Numbered List', icon: svgIcons.numberedList, command: 'numberedList', action: () => execCmd('numberedList') },
        { title: 'Todo List', icon: svgIcons.todoList, command: 'todoList', action: () => execCmd('todoList') },
        { id: 'indent', title: 'Indent', icon: svgIcons.indent, action: () => execCmd('indent') },
        { id: 'outdent', title: 'Outdent', icon: svgIcons.outdent, action: () => execCmd('outdent') }
      ]);
    };
  }

  const formatBtn = bar.querySelector('#grp-btn-format');
  if (formatBtn) {
    formatBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('format', formatBtn, [
        { icon: svgIcons.bold, title: 'Bold', command: 'bold', action: () => execCmd('bold') },
        { icon: svgIcons.italic, title: 'Italic', command: 'italic', action: () => execCmd('italic') },
        { icon: svgIcons.strikethrough, title: 'Strikethrough', command: 'strikethrough', action: () => execCmd('strikethrough') },
        { icon: svgIcons.underline, title: 'Cycle Underline Style', command: 'underline', action: () => execCmd('underline') },
        { icon: svgIcons.underlineSolid, title: 'Solid Underline', command: 'underlineSolid', action: () => execCmd('underlineSolid') },
        { icon: svgIcons.underlineDotted, title: 'Dotted Underline', command: 'underlineDotted', action: () => execCmd('underlineDotted') },
        { icon: svgIcons.underlineDashed, title: 'Dashed Underline', command: 'underlineDashed', action: () => execCmd('underlineDashed') },
        { icon: svgIcons.underlineDouble, title: 'Double Underline', command: 'underlineDouble', action: () => execCmd('underlineDouble') },
        { icon: svgIcons.underlineWavy, title: 'Wavy Underline', command: 'underlineWavy', action: () => execCmd('underlineWavy') },
        { icon: svgIcons.highlighter, title: 'Cycle Markers', command: 'highlightCycle', action: () => execCmd('highlight', { value: 'highlightCycle' }) },
        { icon: svgIcons.highlighter, title: 'Marker 1', command: 'highlightYellow', action: () => execCmd('highlight', { value: 'highlightYellow' }) },
        { icon: svgIcons.highlighter, title: 'Marker 2', command: 'highlightGreen', action: () => execCmd('highlight', { value: 'highlightGreen' }) },
        { icon: svgIcons.highlighter, title: 'Marker 3', command: 'highlightPink', action: () => execCmd('highlight', { value: 'highlightPink' }) },
        { icon: svgIcons.highlighter, title: 'Marker 4', command: 'highlightBlue', action: () => execCmd('highlight', { value: 'highlightBlue' }) },
        { icon: svgIcons.pen, title: 'Cycle Pens', command: 'penCycle', action: () => execCmd('highlight', { value: 'penCycle' }) },
        { icon: svgIcons.pen, title: 'Pen 1', command: 'penRed', action: () => execCmd('highlight', { value: 'penRed' }) },
        { icon: svgIcons.pen, title: 'Pen 2', command: 'penGreen', action: () => execCmd('highlight', { value: 'penGreen' }) },
        { icon: svgIcons.pen, title: 'Pen 3', command: 'penBlue', action: () => execCmd('highlight', { value: 'penBlue' }) },
        { icon: svgIcons.pen, title: 'Pen 4', command: 'penPurple', action: () => execCmd('highlight', { value: 'penPurple' }) }
      ]);
    };
  }

  const tableBtn = bar.querySelector('#grp-btn-table');
  if (tableBtn) {
    tableBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('table', tableBtn, [
        {
          id: 'insertTable',
          icon: svgIcons.insertTable,
          title: 'Insert Table',
          action: () => {
            hidePopupStrip();
            showTableGridPickerModal();
          }
        },
        ...TABLE_ACTIONS.map(item => ({
          id: item.id,
          icon: item.icon,
          title: item.title,
          disabled: !window.wmdxTableActions?.isEnabled(item.id),
          action: () => {
            hidePopupStrip();
            window.wmdxTableActions?.run(item.id);
          }
        }))
      ]);
    };
  }

  const insertBtn = bar.querySelector('#grp-btn-insert');
  if (insertBtn) {
    insertBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('insert', insertBtn, [
        { id: 'image', icon: svgIcons.image, title: 'Insert Image', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('image') },
        { id: 'link', icon: svgIcons.link, title: 'Insert Link', action: () => execCmd('link') },
        { id: 'callout', icon: calloutTypeIcons.info, title: 'Insert Callout', action: () => openCalloutInsertionDialog() },
        { id: 'inlineCode', icon: svgIcons.inlineCode, title: 'Inline Code', command: 'code', action: () => execCmd('code') },
        { id: 'blockQuote', icon: svgIcons.blockQuote, title: 'Insert Quote', action: () => execCmd('blockQuote') },
        { id: 'codeBlock', icon: svgIcons.codeBlock, title: 'Code Block', action: () => execCmd('codeBlock') },
        { id: 'horizontalLine', icon: svgIcons.horizontalLine, title: 'Insert Line', action: () => execCmd('horizontalLine') },
        { id: 'footnote', icon: svgIcons.footnote, title: 'Insert Footnote', action: () => openFootnoteInsertionDialog() }
      ]);
    };
  }

  const menuBtn = bar.querySelector('#grp-btn-menu');
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('menu', menuBtn, [
        { id: 'newFile', icon: svgIcons.newFile, title: 'New File', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('new') },
        { id: 'openFile', icon: svgIcons.openFile, title: 'Open File', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('open') },
        { id: 'saveFile', icon: svgIcons.saveFile, title: 'Save File', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('save') },
        { id: 'saveAsFile', icon: svgIcons.saveAsFile, title: 'Save As', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('save_as') },
        { id: 'saveTabs', icon: svgIcons.saveTabs, title: 'Save Tabs', action: () => { hidePopupStrip(); void window.leftPanelController?.saveTabSession?.(); } },
        { id: 'saveAsTextPack', icon: svgIcons.saveAsTextPack, title: 'Save as Text Pack', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('save_as_textpack') },
        { id: 'exportHtml', icon: svgIcons.exportHtml, title: 'Export HTML / MHTML', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('export') },
        { id: 'search', icon: svgIcons.search, title: 'Find & Replace', action: () => { hidePopupStrip(); toggleFindAndReplaceBar(); } },
        { id: 'switchView', icon: svgIcons.switchView, title: 'Switch View Mode', action: () => openWithOtherEngine() },
        { id: 'newWindow', icon: svgIcons.newWindow, title: 'New Window', action: () => {
          hidePopupStrip();
          if (window.AndroidNative && typeof window.AndroidNative.onNativeAction === 'function') {
            window.AndroidNative.onNativeAction('new_window');
          }
        } },
        { id: 'settings', icon: svgIcons.settings, title: 'Settings', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('settings') }
      ]);
    };
  }

  for (const button of bar.querySelectorAll('.grouped-key-btn')) {
    const id = button.dataset.toolbarKey;
    if (['heading', 'lists', 'format', 'table', 'insert', 'menu', 'undo'].includes(id)) {
      continue;
    }
    if (bottomToolbarConfig.popupGroups[id]) {
      button.onclick = event => {
        event.stopPropagation();
        const items = bottomToolbarConfig.popupGroups[id].order
          .map(itemId => toolbarActionRegistry.get(itemId))
          .filter(Boolean);
        togglePopupStrip(id, button, items);
      };
      continue;
    }
    const action = toolbarActionRegistry.get(id);
    if (action) {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        action.action?.();
      };
    }
  }

}

function setupFloatingSelectionToolbar() {
  const container = document.querySelector('#editor-container');
  if (!container) return;
  let bar = document.querySelector('#floating-selection-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'floating-selection-toolbar';
    bar.className = 'grouped-control-bar floating-selection-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Floating selection toolbar');
    bar.setAttribute('aria-hidden', 'true');
    container.appendChild(bar);
  }
  installToolbarTapActions(bar);

  const registry = createRuntimeToolbarItemRegistryForConfig(floatingToolbarConfig);
  const definitions = Object.fromEntries(
    [...registry].map(([id, item]) => [
      id,
      { id, title: item.title, icon: item.icon, kind: item.kind || 'action' }
    ])
  );
  renderBottomToolbarKeys(bar, floatingToolbarConfig, svgIcons, {
    preventPointerDefault: false,
    resolveCustomIcon: style => style.customSvg || '',
    definitions,
    resolveGestureActionIcon: (actionId, customSvg) => {
      if (customSvg) return sanitizeToolbarSvg(customSvg, false);
      const icon = registry.get(actionId)?.icon;
      return typeof icon === 'string' && icon.includes('<svg')
        ? icon
        : svgIcons[icon] || icon || '';
    },
    onGesture: (id, gestureId, event, button) => {
      const actionId = getToolbarGestureActionId(
        floatingToolbarConfig.styles[id],
        gestureId
      );
      return actionId
        ? runToolbarGestureAction(actionId, button, new Set(), floatingToolbarConfig)
        : false;
    },
    onKeyClick: (id, event) => {
      if (!floatingToolbarConfig.customKeys?.[id]) return;
      event.preventDefault();
      event.stopPropagation();
      runToolbarGestureAction(id, event.currentTarget, new Set(), floatingToolbarConfig);
    }
  });

  if (bar.dataset.floatingClickHandlerInstalled !== 'true') {
    bar.dataset.floatingClickHandlerInstalled = 'true';
    bar.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-toolbar-key], [data-toolbar-style-id]');
      if (!button || !bar.contains(button)) return;
      const id = button.dataset.toolbarKey || button.dataset.toolbarStyleId;
      if (floatingToolbarConfig.customKeys?.[id]) return;
      runToolbarGestureAction(id, button, new Set(), floatingToolbarConfig);
    });
  }

  if (!document.__wmdxFloatingToolbarPositioningInstalled) {
    const refresh = () => scheduleFloatingToolbarPosition();
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('scroll', refresh, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', refresh, { passive: true });
    window.visualViewport?.addEventListener('scroll', refresh, { passive: true });
    document.__wmdxFloatingToolbarPositioningInstalled = true;
  }
  updateFloatingSelectionToolbar();
}

function scheduleFloatingToolbarPosition() {
  if (floatingToolbarSelectionFrame) return;
  floatingToolbarSelectionFrame = window.requestAnimationFrame(() => {
    floatingToolbarSelectionFrame = 0;
    updateFloatingSelectionToolbar();
  });
}

function updateFloatingSelectionToolbar(view = activeAdapter?.view) {
  const bar = document.querySelector('#floating-selection-toolbar');
  if (!bar) return;
  if (!floatingToolbarEnabled) {
    bar.classList.remove('is-visible');
    bar.setAttribute('aria-hidden', 'true');
    if (activePopupSurface === 'floating') hidePopupStrip();
    return;
  }
  const selection = view?.state?.selection?.main;
  if (!view?.dom?.isConnected || !selection || selection.empty) {
    bar.classList.remove('is-visible');
    bar.setAttribute('aria-hidden', 'true');
    if (activePopupSurface === 'floating') hidePopupStrip();
    return;
  }

  let start;
  let end;
  try {
    start = view.coordsAtPos(selection.from);
    end = view.coordsAtPos(selection.to);
  } catch {
    start = null;
    end = null;
  }
  if (!start || !end) {
    bar.classList.remove('is-visible');
    bar.setAttribute('aria-hidden', 'true');
    if (activePopupSurface === 'floating') hidePopupStrip();
    return;
  }

  bar.classList.add('is-visible');
  bar.setAttribute('aria-hidden', 'false');
  bar.style.removeProperty('width');
  const rect = bar.getBoundingClientRect();
  const viewport = window.visualViewport;
  const position = getFloatingToolbarPosition({
    start,
    end,
    toolbarWidth: rect.width,
    toolbarHeight: rect.height,
    viewport: {
      offsetLeft: viewport?.offsetLeft || 0,
      offsetTop: viewport?.offsetTop || 0,
      width: viewport?.width || window.innerWidth,
      height: viewport?.height || window.innerHeight
    }
  });
  bar.style.width = `${position.width}px`;
  bar.style.left = `${position.left}px`;
  bar.style.top = `${position.top}px`;
  if (activePopupSurface === 'floating') positionFloatingPopupStrip();
}

function positionFloatingPopupStrip(targetButton = null) {
  const strip = document.querySelector('#popup-toolbar-strip');
  const bar = targetButton?.closest?.('#floating-selection-toolbar') ||
    document.querySelector('#floating-selection-toolbar');
  if (!strip || strip.classList.contains('hidden') || !bar) return;
  const barRect = bar.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const margin = 8;
  const availableWidth = Math.max(0, viewportWidth - margin * 2);
  strip.style.position = 'fixed';
  strip.style.right = 'auto';
  strip.style.bottom = 'auto';
  strip.style.transform = 'none';
  strip.style.maxWidth = `${availableWidth}px`;
  strip.style.width = `${Math.min(strip.scrollWidth, availableWidth)}px`;
  const stripRect = strip.getBoundingClientRect();
  const left = Math.max(
    viewportLeft + margin,
    Math.min(
      barRect.left + (barRect.width - stripRect.width) / 2,
      viewportLeft + viewportWidth - stripRect.width - margin
    )
  );
  const above = barRect.top - stripRect.height - margin;
  const below = barRect.bottom + margin;
  const top = above >= viewportTop + margin
    ? above
    : below + stripRect.height <= viewportTop + viewportHeight - margin
      ? below
      : Math.max(
        viewportTop + margin,
        Math.min(above, viewportTop + viewportHeight - stripRect.height - margin)
      );
  strip.style.left = `${left}px`;
  strip.style.top = `${top}px`;
}

function createToolbarActionRegistry() {
  const groups = [
    [
      { id: 'paragraph', title: 'Paragraph', icon: 'P', command: 'paragraph', action: () => execCmd('heading', { value: 'paragraph' }) },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `heading${index + 1}`,
        title: `Heading ${index + 1}`,
        icon: `H${index + 1}`,
        command: `heading${index + 1}`,
        action: () => execCmd('heading', { value: `heading${index + 1}` })
      })),
      { id: 'autoHeading', title: 'Auto Heading', icon: svgIcons.autoHeading, command: 'autoHeading', action: () => execCmd('autoHeading') },
      { id: 'wrap', title: 'Toggle Line Wrap', icon: svgIcons.wrap, action: () => window.editorBridge.toggleLineWrap() },
      { id: 'line-numbers', title: 'Toggle Line Numbers', icon: '#', action: () => window.editorBridge.toggleLineNumbers() }
    ],
    [
      { id: 'bulletedList', title: 'Bulleted List', icon: svgIcons.bulletedList, command: 'bulletedList', action: () => execCmd('bulletedList') },
      { id: 'numberedList', title: 'Numbered List', icon: svgIcons.numberedList, command: 'numberedList', action: () => execCmd('numberedList') },
      { id: 'todoList', title: 'Todo List', icon: svgIcons.todoList, command: 'todoList', action: () => execCmd('todoList') },
      { id: 'indent', title: 'Indent', icon: svgIcons.indent, action: () => execCmd('indent') },
      { id: 'outdent', title: 'Outdent', icon: svgIcons.outdent, action: () => execCmd('outdent') }
    ],
    [
      { id: 'bold', title: 'Bold', icon: svgIcons.bold, command: 'bold', action: () => execCmd('bold') },
      { id: 'italic', title: 'Italic', icon: svgIcons.italic, command: 'italic', action: () => execCmd('italic') },
      { id: 'strikethrough', title: 'Strikethrough', icon: svgIcons.strikethrough, command: 'strikethrough', action: () => execCmd('strikethrough') },
      { id: 'underline', title: 'Cycle Underline Style', icon: svgIcons.underline, command: 'underline', action: () => execCmd('underline') },
      { id: 'underlineSolid', title: 'Solid Underline', icon: svgIcons.underlineSolid, command: 'underlineSolid', action: () => execCmd('underlineSolid') },
      { id: 'underlineDotted', title: 'Dotted Underline', icon: svgIcons.underlineDotted, command: 'underlineDotted', action: () => execCmd('underlineDotted') },
      { id: 'underlineDashed', title: 'Dashed Underline', icon: svgIcons.underlineDashed, command: 'underlineDashed', action: () => execCmd('underlineDashed') },
      { id: 'underlineDouble', title: 'Double Underline', icon: svgIcons.underlineDouble, command: 'underlineDouble', action: () => execCmd('underlineDouble') },
      { id: 'underlineWavy', title: 'Wavy Underline', icon: svgIcons.underlineWavy, command: 'underlineWavy', action: () => execCmd('underlineWavy') },
      { id: 'highlightCycle', title: 'Cycle Markers', icon: svgIcons.highlighter, command: 'highlightCycle', action: () => execCmd('highlight', { value: 'highlightCycle' }) },
      { id: 'highlightYellow', title: 'Marker 1', icon: svgIcons.highlighter, command: 'highlightYellow', action: () => execCmd('highlight', { value: 'highlightYellow' }) },
      { id: 'highlightGreen', title: 'Marker 2', icon: svgIcons.highlighter, command: 'highlightGreen', action: () => execCmd('highlight', { value: 'highlightGreen' }) },
      { id: 'highlightPink', title: 'Marker 3', icon: svgIcons.highlighter, command: 'highlightPink', action: () => execCmd('highlight', { value: 'highlightPink' }) },
      { id: 'highlightBlue', title: 'Marker 4', icon: svgIcons.highlighter, command: 'highlightBlue', action: () => execCmd('highlight', { value: 'highlightBlue' }) },
      { id: 'penCycle', title: 'Cycle Pens', icon: svgIcons.pen, command: 'penCycle', action: () => execCmd('highlight', { value: 'penCycle' }) },
      { id: 'penRed', title: 'Pen 1', icon: svgIcons.pen, command: 'penRed', action: () => execCmd('highlight', { value: 'penRed' }) },
      { id: 'penGreen', title: 'Pen 2', icon: svgIcons.pen, command: 'penGreen', action: () => execCmd('highlight', { value: 'penGreen' }) },
      { id: 'penBlue', title: 'Pen 3', icon: svgIcons.pen, command: 'penBlue', action: () => execCmd('highlight', { value: 'penBlue' }) },
      { id: 'penPurple', title: 'Pen 4', icon: svgIcons.pen, command: 'penPurple', action: () => execCmd('highlight', { value: 'penPurple' }) }
    ],
    [
      { id: 'insertTable', title: 'Insert Table', icon: svgIcons.insertTable, action: () => {
        hidePopupStrip();
        showTableGridPickerModal();
      } },
      ...TABLE_ACTIONS.map(item => ({
        id: item.id,
        title: item.title,
        icon: item.icon,
        disabled: !window.wmdxTableActions?.isEnabled(item.id),
        action: () => {
          hidePopupStrip();
          window.wmdxTableActions?.run(item.id);
        }
      }))
    ],
    [
      { id: 'image', title: 'Insert Image', icon: svgIcons.image, action: () => window.AndroidNative?.onNativeAction('image') },
      { id: 'link', title: 'Insert Link', icon: svgIcons.link, action: () => execCmd('link') },
      { id: 'callout', title: 'Insert Callout', icon: calloutTypeIcons.info, action: () => openCalloutInsertionDialog() },
      { id: 'inlineCode', title: 'Inline Code', icon: svgIcons.inlineCode, command: 'code', action: () => execCmd('code') },
      { id: 'blockQuote', title: 'Insert Quote', icon: svgIcons.blockQuote, action: () => execCmd('blockQuote') },
      { id: 'codeBlock', title: 'Code Block', icon: svgIcons.codeBlock, action: () => execCmd('codeBlock') },
      { id: 'horizontalLine', title: 'Insert Line', icon: svgIcons.horizontalLine, action: () => execCmd('horizontalLine') },
      { id: 'footnote', title: 'Insert Footnote', icon: svgIcons.footnote, action: () => openFootnoteInsertionDialog() }
    ],
    [
      { id: 'newFile', title: 'New File', icon: svgIcons.newFile, action: () => window.AndroidNative?.onNativeAction('new') },
      { id: 'openFile', title: 'Open File', icon: svgIcons.openFile, action: () => window.AndroidNative?.onNativeAction('open') },
      { id: 'saveFile', title: 'Save File', icon: svgIcons.saveFile, action: () => window.AndroidNative?.onNativeAction('save') },
      { id: 'saveAsFile', title: 'Save As', icon: svgIcons.saveAsFile, action: () => window.AndroidNative?.onNativeAction('save_as') },
      { id: 'saveTabs', title: 'Save Tabs', icon: svgIcons.saveTabs, action: () => { hidePopupStrip(); void window.leftPanelController?.saveTabSession?.(); } },
      { id: 'saveAsTextPack', title: 'Save as Text Pack', icon: svgIcons.saveAsTextPack, action: () => window.AndroidNative?.onNativeAction('save_as_textpack') },
      { id: 'exportHtml', title: 'Export HTML / MHTML', icon: svgIcons.exportHtml, action: () => window.AndroidNative?.onNativeAction('export') },
      { id: 'search', title: 'Find & Replace', icon: svgIcons.search, action: () => { hidePopupStrip(); toggleFindAndReplaceBar(); } },
      { id: 'switchView', title: 'Switch View Mode', icon: svgIcons.switchView, action: () => openWithOtherEngine() },
      { id: 'newWindow', title: 'New Window', icon: svgIcons.newWindow, action: () => {
        hidePopupStrip();
        window.AndroidNative?.onNativeAction('new_window');
      } },
      { id: 'settings', title: 'Settings', icon: svgIcons.settings, action: () => window.AndroidNative?.onNativeAction('settings') }
    ]
  ];
  const clipboardItems = BUILT_IN_HOLDING_ITEMS.map(item => ({
    ...item,
    icon: svgIcons[item.icon],
    action: () => {
      void runToolbarClipboardAction(item.id);
    }
  }));
  return new Map([...groups.flat(), ...clipboardItems].map(item => [item.id, item]));
}

function getToolbarConfigForElement(element) {
  const floatingToolbar = element?.closest?.('#floating-selection-toolbar');
  if (floatingToolbar) return floatingToolbarConfig;
  const popupStrip = element?.closest?.('#popup-toolbar-strip');
  if (popupStrip?.dataset?.toolbarSurface === 'floating') return floatingToolbarConfig;
  return bottomToolbarConfig;
}

function createRuntimeToolbarItemRegistry() {
  return createRuntimeToolbarItemRegistryForConfig(bottomToolbarConfig);
}

function createRuntimeToolbarItemRegistryForConfig(toolbarConfig) {
  const registry = createToolbarActionRegistry();
  for (const item of BOTTOM_TOOLBAR_ITEMS) {
    if (!toolbarConfig.popupGroups[item.id]) continue;
    registry.set(item.id, {
      ...item,
      kind: 'group',
      icon: svgIcons[item.icon] || item.icon
    });
  }
  for (const [id, group] of Object.entries(toolbarConfig.customGroups || {})) {
    registry.set(id, {
      id,
      title: group.title,
      icon: svgIcons[group.icon] || group.icon,
      kind: 'group'
    });
  }
  for (const [id, key] of Object.entries(toolbarConfig.customKeys || {})) {
    registry.set(id, {
      id,
      title: key.title,
      icon: svgIcons[key.icon] || key.icon,
      kind: 'action'
    });
  }
  for (const item of [
    { id: 'historyBack', title: 'Back in Navigation History', icon: svgIcons.undo },
    { id: 'historyForward', title: 'Forward in Navigation History', icon: svgIcons.redo },
    { id: 'toggleToolbar', title: 'Show or Hide Toolbar', icon: svgIcons.menu },
    { id: 'removeHighlight', title: 'Remove Highlight', icon: svgIcons.strikethrough },
    {
      id: 'editToolbarKeyPreferences',
      title: "Edit This Key's Preferences",
      icon: svgIcons.wrench
    },
    { id: OPEN_GROUP_ACTION_ID, title: 'Open group', icon: svgIcons.folder }
  ]) {
    registry.set(item.id, item);
  }
  return registry;
}

function runToolbarGestureAction(
  actionId,
  sourceButton,
  visited = new Set(),
  toolbarConfig = getToolbarConfigForElement(sourceButton)
) {
  if (!actionId || visited.has(actionId)) return false;
  visited.add(actionId);
  if (actionId === 'editToolbarKeyPreferences') {
    hidePopupStrip();
    return openToolbarKeyPreferences(sourceButton, toolbarConfig);
  }
  if (actionId === OPEN_GROUP_ACTION_ID) {
    const toolbarGroupId = [
      sourceButton?.dataset?.toolbarKey,
      sourceButton?.dataset?.toolbarStyleId
    ].find(id => id && toolbarConfig.popupGroups[id]);
    if (!toolbarGroupId) return false;
    togglePopupStrip(
      toolbarGroupId,
      sourceButton,
      getRuntimeToolbarGroupItemsForConfig(toolbarGroupId, toolbarConfig)
    );
    return true;
  }
  if (actionId === 'undo') {
    activeAdapter?.undo();
    return Boolean(activeAdapter);
  }
  if (actionId === 'historyBack' || actionId === 'historyForward') {
    const direction = actionId === 'historyBack' ? 'back' : 'forward';
    if (!navigateTocHistory(direction) && window.AndroidNative) {
      window.AndroidNative.onNativeAction(
        direction === 'back' ? 'history_back' : 'history_forward'
      );
    }
    return true;
  }
  if (actionId === 'toggleToolbar') {
    toggleBottomToolbar();
    return true;
  }
  if (actionId === 'removeHighlight') {
    execCmd('highlight', { value: null });
    return true;
  }
  const customKey = toolbarConfig.customKeys?.[actionId];
  if (customKey) {
    return runToolbarGestureAction(customKey.actionId, sourceButton, visited, toolbarConfig);
  }
  const item = createRuntimeToolbarItemRegistryForConfig(toolbarConfig).get(actionId);
  if (!item) return false;
  if (toolbarConfig.popupGroups[actionId]) {
    togglePopupStrip(
      actionId,
      sourceButton,
      getRuntimeToolbarGroupItemsForConfig(actionId, toolbarConfig)
    );
    return true;
  }
  if (typeof item.action !== 'function') return false;
  item.action();
  return true;
}

function openToolbarKeyPreferences(sourceButton, toolbarConfig) {
  if (currentEditorMode !== 'wysiwyg') return false;
  const keyId =
    sourceButton?.dataset?.toolbarStyleId ||
    sourceButton?.dataset?.toolbarKey;
  if (!keyId) return false;

  const registry = createRuntimeToolbarItemRegistryForConfig(toolbarConfig);
  const definition = registry.get(keyId);
  const title =
    (keyId === TOOLBAR_TOGGLE_STYLE_ID ? 'Toolbar toggle' : '') ||
    toolbarConfig.styles?.[keyId]?.title ||
    toolbarConfig.customGroups?.[keyId]?.title ||
    toolbarConfig.customKeys?.[keyId]?.title ||
    definition?.title ||
    keyId;
  const surface = toolbarConfig === floatingToolbarConfig ? 'floating' : 'bottom';
  return openToolbarKeyPreferencesDialog({
    keyId,
    keyTitle: title,
    surface,
    config: toolbarConfig,
    onSave: (targetSurface, nextConfig) => {
      const save = window.AndroidNative?.saveToolbarKeyPreferences;
      if (typeof save !== 'function') return false;
      const rawConfig = JSON.stringify(nextConfig);
      if (!save(targetSurface, rawConfig)) return false;
      if (targetSurface === 'floating') {
        window.editorBridge?.applyFloatingToolbarConfig?.(nextConfig);
      } else {
        window.editorBridge?.applyBottomToolbarConfig?.(nextConfig);
      }
      return true;
    }
  });
}

async function runToolbarClipboardAction(actionId) {
  const view = activeAdapter?.view;
  if (!view) return false;

  if (actionId === 'selectAll') {
    view.dispatch({
      selection: { anchor: 0, head: view.state.doc.length },
      userEvent: 'select'
    });
    view.focus();
    return true;
  }

  if (actionId === 'copy' || actionId === 'cut') {
    const state = view.state;
    const { from, to } = state.selection.main;
    if (from === to) return false;
    const text = state.sliceDoc(from, to);
    let copied = false;
    try {
      if (typeof window.AndroidNative?.writeClipboard === 'function') {
        copied = window.AndroidNative.writeClipboard(text) !== false;
      }
      if (!copied && typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      window.AndroidNative?.showToast?.('Clipboard access is unavailable');
      return false;
    }
    if (actionId === 'cut' && view.state === state) {
      view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
        userEvent: 'delete.cut'
      });
    }
    view.focus();
    return true;
  }

  if (actionId === 'paste') {
    let text;
    try {
      if (typeof window.AndroidNative?.readClipboard === 'function') {
        text = window.AndroidNative.readClipboard();
      } else if (typeof navigator.clipboard?.readText === 'function') {
        text = await navigator.clipboard.readText();
      }
    } catch {
      text = undefined;
    }
    if (typeof text !== 'string') {
      window.AndroidNative?.showToast?.('Clipboard access is unavailable');
      return false;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      userEvent: 'input.paste'
    });
    view.focus();
    return true;
  }

  return false;
}

function installPopupToolbarSwipeUp(
  button,
  styleId,
  toolbarConfigSource = null
) {
  const getToolbarConfig = () => {
    if (typeof toolbarConfigSource === 'function') return toolbarConfigSource();
    return toolbarConfigSource || getToolbarConfigForElement(button);
  };
  let pointerStart = null;
  let longPressTimer = null;
  let longPressHandled = false;
  const clearLongPressTimer = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  button.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    clearLongPressTimer();
    longPressHandled = false;
    pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not available in every embedded WebView version.
    }
    if (getToolbarConfig().styles[styleId]?.gestureActions?.longPress) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!pointerStart) return;
        const toolbarConfig = getToolbarConfig();
        const actionId = toolbarConfig.styles[styleId]?.gestureActions?.longPress;
        longPressHandled = Boolean(
          actionId && runToolbarGestureAction(actionId, button, new Set(), toolbarConfig)
        );
        if (longPressHandled) {
          button.dataset.toolbarGestureSuppressClick = 'true';
        }
      }, 500);
    }
  }, { capture: true });
  button.addEventListener('pointermove', event => {
    if (pointerStart?.pointerId !== undefined &&
        event.pointerId !== pointerStart.pointerId) return;
    if (!pointerStart || longPressTimer === null) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) {
      clearLongPressTimer();
    }
  }, { capture: true });
  button.addEventListener('pointerup', event => {
    clearLongPressTimer();
    if (pointerStart?.pointerId !== undefined &&
        event.pointerId !== pointerStart.pointerId) return;
    if (!pointerStart) return;
    if (longPressHandled) {
      longPressHandled = false;
      pointerStart = null;
      event.preventDefault();
      return;
    }
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;
    const gestureId = getToolbarSwipeGesture(deltaX, deltaY);
    if (!gestureId) return;
    const toolbarConfig = getToolbarConfig();
    const style = toolbarConfig.styles[styleId] || {};
    const actionId = getToolbarGestureActionId(style, gestureId);
    if (!actionId ||
        !runToolbarGestureAction(actionId, button, new Set(), toolbarConfig)) return;
    button.dataset.toolbarGestureSuppressClick = 'true';
    event.preventDefault();
  }, { capture: true });
  button.addEventListener('pointercancel', () => {
    clearLongPressTimer();
    pointerStart = null;
    longPressHandled = false;
  }, { capture: true });
  button.addEventListener('click', event => {
    if (button.dataset.toolbarGestureSuppressClick !== 'true') return;
    delete button.dataset.toolbarGestureSuppressClick;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}

function getToolbarGestureIcon(actionId, customSvg, toolbarConfig = bottomToolbarConfig) {
  if (customSvg === NO_GESTURE_ICON) return '';
  if (customSvg) return sanitizeToolbarSvg(customSvg, false);
  const icon = createRuntimeToolbarItemRegistryForConfig(toolbarConfig).get(actionId)?.icon;
  return typeof icon === 'string' && icon.includes('<svg')
    ? icon
    : svgIcons[icon] || icon || '';
}

function getRuntimeToolbarGroupItems(groupId) {
  return getRuntimeToolbarGroupItemsForConfig(groupId, bottomToolbarConfig);
}

function getRuntimeToolbarGroupItemsForConfig(groupId, toolbarConfig) {
  const registry = createRuntimeToolbarItemRegistryForConfig(toolbarConfig);
  return (toolbarConfig.popupGroups[groupId]?.order || [])
    .map(id => {
      const item = registry.get(id);
      return item ? { ...item, styleId: id } : null;
    })
    .filter(Boolean);
}

export function getDocumentHeadings(doc) {
  const headings = [];
  if (!doc) return headings;
  for (let i = 1; i <= doc.lines; i++) {
    const lineText = doc.line(i).text.trim();
    if (/^#{1,6}\s+/.test(lineText)) {
      headings.push(cleanHeadingText(lineText));
    }
  }
  return headings;
}

export function openLinkInsertionDialog() {
  if (!activeAdapter || !activeAdapter.view) return;
  const view = activeAdapter.view;

  let selectionSnapshot = null;
  const activeOverlay = document.querySelector('.cm-wp-cell-editor');

  if (activeOverlay && activeOverlay._cellMeta) {
    const meta = activeOverlay._cellMeta;
    const selStart = activeOverlay.selectionStart ?? 0;
    const selEnd = activeOverlay.selectionEnd ?? 0;
    const cellVal = activeOverlay.value || '';
    selectionSnapshot = {
      type: 'table-cell',
      widget: meta.widget,
      model: meta.model,
      row: meta.row,
      col: meta.col,
      selStart,
      selEnd,
      cellVal,
      selectedText: cellVal.substring(selStart, selEnd)
    };
  } else if (window._lastActiveCellSelection && (Date.now() - window._lastActiveCellSelection.timestamp < 3000)) {
    const snap = window._lastActiveCellSelection;
    selectionSnapshot = {
      type: 'table-cell',
      widget: snap.widget,
      model: snap.model,
      row: snap.row,
      col: snap.col,
      selStart: snap.selStart,
      selEnd: snap.selEnd,
      cellVal: snap.cellValue,
      selectedText: snap.selectedText
    };
  } else {
    const sel = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(sel.from, sel.to);
    selectionSnapshot = {
      type: 'editor',
      from: sel.from,
      to: sel.to,
      selectedText
    };
  }

  const selectedText = selectionSnapshot ? selectionSnapshot.selectedText : '';
  const overlay = document.querySelector('#editor-modal-overlay');
  const dialog = document.querySelector('#editor-modal-dialog');
  if (!overlay || !dialog) return;

  const headings = getDocumentHeadings(view.state.doc);

  dialog.innerHTML = `
    <h3 class="modal-title">Insert Link</h3>
    <div class="modal-field-group">
      <label class="modal-label">Link Kind</label>
      <select id="modal-link-kind" class="modal-select">
        <option value="web">Web URL</option>
        <option value="heading">Heading in this document</option>
      </select>
    </div>
    <div class="modal-field-group">
      <label class="modal-label" id="modal-label-text">Display Text</label>
      <input type="text" id="modal-link-text" class="modal-input" placeholder="Text to display" value="${selectedText.replace(/"/g, '&quot;')}" />
    </div>
    <div class="modal-field-group" id="group-web-url">
      <label class="modal-label">Web URL</label>
      <input type="text" id="modal-link-url" class="modal-input" placeholder="https://" value="https://" />
    </div>
    <div class="modal-field-group hidden" id="group-heading-picker" style="display:none;">
      <label class="modal-label">Target Heading</label>
      <select id="modal-heading-select" class="modal-select">
        ${headings.length > 0
          ? headings.map(h => `<option value="${h.replace(/"/g, '&quot;')}">${h}</option>`).join('')
          : '<option value="">(No headings found in document)</option>'}
      </select>
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-cancel" id="modal-btn-cancel">Cancel</button>
      <button type="button" class="modal-btn modal-btn-confirm" id="modal-btn-confirm">Insert</button>
    </div>
  `;

  const kindSelect = dialog.querySelector('#modal-link-kind');
  const groupWeb = dialog.querySelector('#group-web-url');
  const groupHeading = dialog.querySelector('#group-heading-picker');
  const labelText = dialog.querySelector('#modal-label-text');
  const textInput = dialog.querySelector('#modal-link-text');
  const urlInput = dialog.querySelector('#modal-link-url');
  const headingSelect = dialog.querySelector('#modal-heading-select');
  const btnCancel = dialog.querySelector('#modal-btn-cancel');
  const btnConfirm = dialog.querySelector('#modal-btn-confirm');

  kindSelect.addEventListener('change', () => {
    if (kindSelect.value === 'web') {
      groupWeb.style.display = 'flex';
      groupHeading.style.display = 'none';
      labelText.textContent = 'Display Text';
    } else {
      groupWeb.style.display = 'none';
      groupHeading.style.display = 'flex';
      labelText.textContent = 'Link Alias (Optional)';
    }
  });

  const closeModal = () => {
    overlay.classList.remove('open');
    dialog.innerHTML = '';
  };

  btnCancel.addEventListener('click', (e) => {
    e.preventDefault();
    window._lastActiveCellSelection = null;
    closeModal();
    view.focus();
  });

  btnConfirm.addEventListener('click', (e) => {
    e.preventDefault();
    const kind = kindSelect.value;
    const displayText = textInput.value.trim();
    let replacement = '';

    if (kind === 'web') {
      const url = urlInput.value.trim() || 'https://';
      const label = displayText || url;
      replacement = `[${label}](${url})`;
    } else {
      const targetHeading = headingSelect.value;
      if (!targetHeading) {
        window._lastActiveCellSelection = null;
        closeModal();
        view.focus();
        return;
      }
      if (displayText) {
        replacement = `[[#${targetHeading}|${displayText}]]`;
      } else {
        replacement = `[[#${targetHeading}]]`;
      }
    }

    if (selectionSnapshot && selectionSnapshot.type === 'table-cell') {
      const snap = selectionSnapshot;
      const model = snap.model;
      const r = snap.row;
      const c = snap.col;
      const currentVal = (model.rows[r] && model.rows[r][c] !== undefined) ? model.rows[r][c] : (snap.cellVal || '');
      const start = Math.min(snap.selStart, currentVal.length);
      const end = Math.min(snap.selEnd, currentVal.length);
      const newVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);

      if (model.rows[r]) {
        model.rows[r][c] = newVal;
      }

      if (snap.widget && typeof snap.widget.commitModel === 'function') {
        snap.widget.commitModel(view, model);
      } else {
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: replacement },
          selection: { anchor: sel.from + replacement.length, head: sel.from + replacement.length }
        });
      }
      window._lastActiveCellSelection = null;
    } else {
      const from = selectionSnapshot ? selectionSnapshot.from : view.state.selection.main.from;
      const to = selectionSnapshot ? selectionSnapshot.to : view.state.selection.main.to;
      view.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from + replacement.length, head: from + replacement.length }
      });
    }

    closeModal();
    view.focus();
  });

  overlay.classList.add('open');
  requestAnimationFrame(() => {
    textInput.focus();
  });
}

export function openFootnoteInsertionDialog(options = {}) {
  if (!activeAdapter || !activeAdapter.view) return;
  const view = activeAdapter.view;
  const definition = options.definition ?? null;
  const selection = view.state.selection.main;
  const selectionSnapshot = { from: selection.from, to: selection.to };
  const overlay = document.querySelector('#editor-modal-overlay');
  const dialog = document.querySelector('#editor-modal-dialog');
  if (!overlay || !dialog) return;

  dialog.innerHTML = `
    <h3 class="modal-title">${definition ? 'Edit Footnote' : 'Insert Footnote'}</h3>
    <div class="modal-field-group">
      <label class="modal-label" for="modal-footnote-text">Footnote text</label>
      <textarea id="modal-footnote-text" class="modal-input modal-textarea"
        placeholder="Write the footnote here"></textarea>
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-cancel" id="modal-btn-cancel">Cancel</button>
      <button type="button" class="modal-btn modal-btn-confirm" id="modal-btn-confirm">
        ${definition ? 'Save' : 'Insert'}
      </button>
    </div>
  `;

  const textInput = dialog.querySelector('#modal-footnote-text');
  const btnCancel = dialog.querySelector('#modal-btn-cancel');
  const btnConfirm = dialog.querySelector('#modal-btn-confirm');
  textInput.value = definition?.body ?? '';

  const closeModal = () => {
    overlay.classList.remove('open');
    dialog.innerHTML = '';
  };

  btnCancel.addEventListener('click', event => {
    event.preventDefault();
    closeModal();
    view.focus();
  });

  btnConfirm.addEventListener('click', event => {
    event.preventDefault();
    const body = textInput.value.trim();
    if (!body) {
      textInput.focus();
      return;
    }

    if (definition) {
      const formattedDefinition = formatFootnoteDefinition(definition.label, body);
      view.dispatch({
        changes: {
          from: definition.from,
          to: definition.to,
          insert: formattedDefinition
        },
        selection: {
          anchor: definition.from + formattedDefinition.length,
          head: definition.from + formattedDefinition.length
        }
      });
    } else {
      const label = nextFootnoteLabel(view.state.doc.toString());
      const marker = `[^${label}]`;
      const formattedDefinition = formatFootnoteDefinition(label, body);
      const docText = view.state.doc.toString();
      const separatorFor = text => {
        if (!text) return '\n\n';
        if (text.endsWith('\n\n')) return '';
        if (text.endsWith('\n')) return '\n';
        return '\n\n';
      };
      const markerEnd = selectionSnapshot.to + marker.length;
      const changes = selectionSnapshot.to === view.state.doc.length
        ? {
            from: selectionSnapshot.to,
            insert: marker +
              separatorFor(docText.slice(0, selectionSnapshot.to) + marker) +
              formattedDefinition + '\n\n'
          }
        : [
            { from: selectionSnapshot.to, insert: marker },
            {
              from: view.state.doc.length,
              insert: separatorFor(docText) + formattedDefinition + '\n\n'
            }
          ];

      view.dispatch({
        changes,
        selection: { anchor: markerEnd, head: markerEnd }
      });
    }

    closeModal();
    view.focus();
  });

  overlay.classList.add('open');
  requestAnimationFrame(() => textInput.focus());
}

function openImageEditDialog(view, from, to, alt, url, imageWidth = null) {
  const overlay = document.querySelector('#editor-modal-overlay');
  const dialog = document.querySelector('#editor-modal-dialog');
  if (!overlay || !dialog || !view) return;

  dialog.innerHTML = `
    <h3 class="modal-title">Edit Image</h3>
    <div class="modal-field-group">
      <label class="modal-label" for="modal-image-alt">Description (alt text)</label>
      <input id="modal-image-alt" class="modal-input" type="text" autocomplete="off" />
    </div>
    <div class="modal-field-group">
      <label class="modal-label" for="modal-image-url">Image location</label>
      <input id="modal-image-url" class="modal-input" type="text" autocomplete="off" />
    </div>
      <div class="modal-field-group">
        <label class="modal-label" for="modal-image-width">Width in pixels (optional)</label>
        <input id="modal-image-width" class="modal-input" type="number" min="1" max="10000" step="1" inputmode="numeric" placeholder="Automatic" />
      </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-cancel" id="modal-image-cancel">Cancel</button>
      <button type="button" class="modal-btn modal-btn-confirm" id="modal-image-save">Save</button>
    </div>
  `;

  const altInput = dialog.querySelector('#modal-image-alt');
  const urlInput = dialog.querySelector('#modal-image-url');
  const widthInput = dialog.querySelector('#modal-image-width');
  const error = document.createElement('p');
  error.className = 'modal-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  dialog.querySelector('.modal-actions').before(error);
  altInput.value = alt;
  urlInput.value = url;
  widthInput.value = imageWidth ?? '';

  const close = () => {
    overlay.classList.remove('open');
    dialog.innerHTML = '';
    view.focus();
  };
  dialog.querySelector('#modal-image-cancel').addEventListener('click', event => {
    event.preventDefault();
    close();
  });
  dialog.querySelector('#modal-image-save').addEventListener('click', event => {
    event.preventDefault();
    const newUrl = urlInput.value.trim();
    if (!newUrl) {
      error.textContent = 'Enter an image location before saving.';
      error.hidden = false;
      urlInput.focus();
      return;
    }
    const widthText = widthInput.value.trim();
    const newWidth = widthText === '' ? null : Number(widthText);
    if (newWidth !== null &&
      (!Number.isInteger(newWidth) || newWidth < 1 || newWidth > 10000)
    ) {
      error.textContent = 'Width must be a whole number from 1 to 10000 pixels.';
      error.hidden = false;
      widthInput.focus();
      return;
    }
    if (
      from < 0 ||
      to > view.state.doc.length ||
      from >= to ||
      !parseMarkdownImage(view.state.doc.sliceString(from, to))
    ) {
      error.textContent = 'This image is no longer in the document.';
      error.hidden = false;
      return;
    }

    const markdown = formatMarkdownImage(altInput.value, newUrl, newWidth);
    view.dispatch({
      changes: { from, to, insert: markdown },
      selection: { anchor: from + markdown.length, head: from + markdown.length }
    });
    close();
  });

  overlay.classList.add('open');
  requestAnimationFrame(() => altInput.focus());
}

function openImageDeleteConfirmation(view, from, to) {
  const overlay = document.querySelector('#editor-modal-overlay');
  const dialog = document.querySelector('#editor-modal-dialog');
  if (!overlay || !dialog || !view) return;

  dialog.innerHTML = `
    <h3 class="modal-title">Delete Image?</h3>
    <p class="modal-message">
      This removes the image from the document only. The image file itself will not be deleted.
    </p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-cancel" id="modal-image-keep">Keep Image</button>
      <button type="button" class="modal-btn modal-btn-delete" id="modal-image-confirm-delete">Delete</button>
    </div>
  `;
  const close = () => {
    overlay.classList.remove('open');
    dialog.innerHTML = '';
    view.focus();
  };
  dialog.querySelector('#modal-image-keep').addEventListener('click', event => {
    event.preventDefault();
    close();
  });
  dialog.querySelector('#modal-image-confirm-delete').addEventListener('click', event => {
    event.preventDefault();
    if (
      from < 0 ||
      to > view.state.doc.length ||
      from >= to ||
      !parseMarkdownImage(view.state.doc.sliceString(from, to))
    ) {
      close();
      return;
    }
    view.dispatch({
      changes: { from, to, insert: '' },
      selection: { anchor: from, head: from }
    });
    close();
  });
  overlay.classList.add('open');
}

export function openCalloutInsertionDialog() {
  if (!activeAdapter || !activeAdapter.view) return;
  const view = activeAdapter.view;
  const sel = view.state.selection.main;
  const selectedText = view.state.doc.sliceString(sel.from, sel.to);

  const overlay = document.querySelector('#editor-modal-overlay');
  const dialog = document.querySelector('#editor-modal-dialog');
  if (!overlay || !dialog) return;

  const supportedTypes = ['note', 'info', 'tip', 'warning', 'important', 'danger', 'question', 'faq', 'todo', 'example'];

  dialog.innerHTML = `
    <h3 class="modal-title">Insert Callout</h3>
    <div class="modal-field-group">
      <label class="modal-label">Callout Type</label>
      <select id="modal-callout-type" class="modal-select">
        ${supportedTypes.map(t => `<option value="${t}">${t.toUpperCase()}</option>`).join('')}
      </select>
    </div>
    <div class="modal-field-group">
      <label class="modal-label">Custom Title (Optional)</label>
      <input type="text" id="modal-callout-title" class="modal-input" placeholder="Default type name" />
    </div>
    <div class="modal-field-group">
      <label class="modal-label">Fold State</label>
      <select id="modal-callout-fold" class="modal-select">
        <option value="">Not foldable</option>
        <option value="+">Expanded (+)</option>
        <option value="-">Collapsed (-)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-cancel" id="modal-btn-cancel">Cancel</button>
      <button type="button" class="modal-btn modal-btn-confirm" id="modal-btn-confirm">Insert</button>
    </div>
  `;

  const typeSelect = dialog.querySelector('#modal-callout-type');
  const titleInput = dialog.querySelector('#modal-callout-title');
  const foldSelect = dialog.querySelector('#modal-callout-fold');
  const btnCancel = dialog.querySelector('#modal-btn-cancel');
  const btnConfirm = dialog.querySelector('#modal-btn-confirm');

  const closeModal = () => {
    overlay.classList.remove('open');
    dialog.innerHTML = '';
  };

  btnCancel.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
    view.focus();
  });

  btnConfirm.addEventListener('click', (e) => {
    e.preventDefault();
    const type = typeSelect.value || 'note';
    const fold = foldSelect.value;
    const title = titleInput.value.trim();

    let opener = `> [!${type}${fold}]`;
    if (title) opener += ` ${title}`;

    let replacement = '';
    let caretOffset = 0;

    if (selectedText.length > 0) {
      const quotedBody = selectedText.split('\n').map(l => `> ${l}`).join('\n');
      replacement = `${opener}\n${quotedBody}\n`;
      caretOffset = replacement.length;
    } else {
      replacement = `${opener}\n> `;
      caretOffset = replacement.length;
    }

    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: sel.from + caretOffset, head: sel.from + caretOffset }
    });

    closeModal();
    view.focus();
  });

  overlay.classList.add('open');
  requestAnimationFrame(() => {
    titleInput.focus();
  });
}

function showTableGridPickerModal() {
  let modal = document.querySelector('#table-grid-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'table-grid-modal';
    modal.style.cssText = 'position: fixed; bottom: calc(var(--toolbar-height, 48px) + 12px); left: 50%; transform: translateX(-50%); background: #222428; border: 1px solid #444; border-radius: 12px; padding: 12px; z-index: 10008; box-shadow: 0 8px 24px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; gap: 8px;';

    const label = document.createElement('div');
    label.id = 'table-grid-label';
    label.style.cssText = 'font-size: 13px; font-weight: bold; color: #ffffff;';
    label.textContent = '1 x 1 Table';
    modal.appendChild(label);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(10, 18px); grid-template-rows: repeat(10, 18px); gap: 3px; cursor: pointer;';

    for (let r = 1; r <= 10; r++) {
      for (let c = 1; c <= 10; c++) {
        const cell = document.createElement('div');
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.className = 'grid-picker-cell';
        cell.style.cssText = 'width: 18px; height: 18px; border: 1px solid #555; background: #333; border-radius: 2px;';

        cell.addEventListener('pointerenter', () => updateGridHighlight(r, c));
        cell.addEventListener('click', () => {
          insertCustomTable(r, c);
          modal.remove();
        });
        grid.appendChild(cell);
      }
    }
    modal.appendChild(grid);
    document.body.appendChild(modal);

    const closeHandler = (e) => {
      if (!modal.contains(e.target) && !e.target.closest('#grp-btn-table')) {
        modal.remove();
        document.removeEventListener('pointerdown', closeHandler);
      }
    };
    document.addEventListener('pointerdown', closeHandler);
  }

  function updateGridHighlight(maxR, maxC) {
    const label = document.querySelector('#table-grid-label');
    if (label) label.textContent = `${maxR} x ${maxC} Table`;
    document.querySelectorAll('.grid-picker-cell').forEach(cell => {
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      if (r <= maxR && c <= maxC) {
        cell.style.background = '#0078d4';
        cell.style.borderColor = '#0078d4';
      } else {
        cell.style.background = '#333';
        cell.style.borderColor = '#555';
      }
    });
  }
}

function insertCustomTable(rows, cols) {
  if (!activeAdapter || !activeAdapter.view) return;
  const view = activeAdapter.view;
  let headers = '|';
  let dividers = '|';
  for (let c = 1; c <= cols; c++) {
    headers += ` Header ${c} |`;
    dividers += ' --- |';
  }
  let tableMarkdown = `\n${headers}\n${dividers}\n`;
  for (let r = 1; r <= rows; r++) {
    let rowStr = '|';
    for (let c = 1; c <= cols; c++) {
      rowStr += ` Cell ${r}-${c} |`;
    }
    tableMarkdown += `${rowStr}\n`;
  }
  cmWrapSelection(view, tableMarkdown, '');
  hidePopupStrip();
}

function execCmd(cmdName, options) {
  if (activeAdapter && activeAdapter.view) {
    const view = activeAdapter.view;
    if (
      cmdName === 'bold' ||
      cmdName === 'italic' ||
      cmdName === 'strikethrough' ||
      cmdName === 'code'
    ) {
      toggleMarkdownFormat(view, cmdName);
    } else if (cmdName === 'underline') {
      toggleUnderlineFormat(view, 'cycle');
    } else if (cmdName.startsWith('underline')) {
      toggleUnderlineFormat(
        view,
        cmdName.slice('underline'.length).toLowerCase()
      );
    } else if (cmdName === 'blockQuote') cmToggleLinePrefix(view, '> ');
    else if (cmdName === 'codeBlock') cmWrapSelection(view, '```\n', '\n```');
    else if (cmdName === 'bulletedList') cmToggleLinePrefix(view, '- ');
    else if (cmdName === 'numberedList') cmToggleLinePrefix(view, '1. ');
    else if (cmdName === 'todoList') cmToggleLinePrefix(view, '- [ ] ');
    else if (cmdName === 'indent') cmIndentSelection(view, '  ');
    else if (cmdName === 'outdent') cmOutdentSelection(view, '  ');
    else if (cmdName === 'horizontalLine') cmWrapSelection(view, '\n---\n', '');
    else if (cmdName === 'InsertFootnote') openFootnoteInsertionDialog();
    else if (cmdName === 'link') openLinkInsertionDialog();
    else if (cmdName === 'callout') openCalloutInsertionDialog();
    else if (cmdName === 'insertTable') cmWrapSelection(view, '\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n', '');
    else if (cmdName === 'autoHeading') applyAutoHeading(view);
    else if (cmdName === 'heading') {
      const val = options ? options.value : '';
      if (val === 'paragraph') cmToggleLinePrefix(view, '');
      else if (val === 'heading1') cmToggleLinePrefix(view, '# ');
      else if (val === 'heading2') cmToggleLinePrefix(view, '## ');
      else if (val === 'heading3') cmToggleLinePrefix(view, '### ');
      else if (val === 'heading4') cmToggleLinePrefix(view, '#### ');
      else if (val === 'heading5') cmToggleLinePrefix(view, '##### ');
      else if (val === 'heading6') cmToggleLinePrefix(view, '###### ');
    } else if (cmdName === 'highlight') {
      const val = options ? options.value : null;
      toggleWmdxColorFormat(view, val);
    }
  }
}

function hidePopupStrip() {
  const strip = document.querySelector('#popup-toolbar-strip');
  if (strip) {
    strip.classList.add('hidden');
    strip.classList.remove('is-floating-popup');
    strip.innerHTML = '';
    strip.style.removeProperty('left');
    strip.style.removeProperty('top');
    strip.style.removeProperty('width');
    strip.style.removeProperty('max-width');
    strip.style.removeProperty('right');
    strip.style.removeProperty('bottom');
    strip.style.removeProperty('position');
    strip.style.removeProperty('transform');
    strip.dataset.toolbarSurface = 'bottom';
  }
  activePopupGroup = null;
  activeToolbarRootKey = null;
  activePopupSurface = 'bottom';
  document.querySelectorAll('.grouped-key-btn').forEach(btn => btn.classList.remove('active'));
}

function togglePopupStrip(
  groupKey,
  targetBtn,
  items,
  toolbarConfig = getToolbarConfigForElement(targetBtn)
) {
  const strip = document.querySelector('#popup-toolbar-strip');
  if (!strip) return;
  installToolbarTapActions(strip);
  const surface = toolbarConfig === floatingToolbarConfig ? 'floating' : 'bottom';

  if (activePopupGroup === groupKey && activePopupSurface === surface) {
    hidePopupStrip();
    return;
  }

  if (targetBtn?.closest('.grouped-control-bar')) {
    activeToolbarRootKey = targetBtn.dataset.toolbarKey || groupKey;
  }
  strip.innerHTML = '';
  strip.dataset.toolbarSurface = surface;
  strip.classList.toggle('is-floating-popup', surface === 'floating');
  strip.classList.remove('hidden');
  activePopupGroup = groupKey;
  activePopupSurface = surface;
  document.querySelectorAll('.grouped-key-btn').forEach(btn => btn.classList.remove('active'));
  const rootKey = activeToolbarRootKey || groupKey;
  const rootSelector = surface === 'floating'
    ? '#floating-selection-toolbar [data-toolbar-key]'
    : '#bottom-toolbar [data-toolbar-key]';
  const rootKeyButton = [...document.querySelectorAll(rootSelector)]
    .find(button => button.dataset.toolbarKey === rootKey);
  rootKeyButton?.classList.add('active');

  const configuredItems = bottomToolbarConfig.popupGroups[groupKey]
    ? surface === 'bottom'
      ? getRuntimeToolbarGroupItems(groupKey)
      : getRuntimeToolbarGroupItemsForConfig(groupKey, toolbarConfig)
    : toolbarConfig.popupGroups[groupKey]
      ? getRuntimeToolbarGroupItemsForConfig(groupKey, toolbarConfig)
    : items;
  orderBottomToolbarPopupItems(
    groupKey,
    configuredItems,
    toolbarConfig.popupGroups
  ).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'popup-strip-btn';
    const styleId = item.styleId || item.id || item.command;
    const style = styleId ? toolbarConfig.styles[styleId] || {} : {};
    btn.classList.toggle('has-toolbar-swipe-action', hasToolbarSwipeActions(style));
    btn.classList.toggle('toolbar-key-force-label', style.forceShowLabel === true);
    if (styleId) btn.dataset.toolbarStyleId = styleId;
    if (style.iconColor) {
      btn.style.setProperty('--toolbar-key-icon-color', toToolbarCssColor(style.iconColor));
    }
    if (style.backgroundColor) {
      btn.style.setProperty('--toolbar-key-bg-color', toToolbarCssColor(style.backgroundColor));
    }
    if (style.activeBackgroundColor) {
      btn.style.setProperty(
        '--toolbar-key-active-bg-color',
        toToolbarCssColor(style.activeBackgroundColor)
      );
    }
    const title = style.title || item.title;
    if (title) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    if (item.disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('disabled');
    }
    if (item.command) btn.dataset.toolbarCommand = item.command;
    const customIcon = style.customSvg
      ? sanitizeToolbarSvg(style.customSvg, style.preserveSvgColors === true)
      : '';
    const icon = document.createElement('span');
    icon.className = 'toolbar-key-icon';
    const iconMarkup = customIcon || item.icon || '';
    if (iconMarkup.includes?.('<svg')) icon.innerHTML = iconMarkup;
    else icon.textContent = iconMarkup || title || '';
    btn.appendChild(icon);
    const label = document.createElement('span');
    label.className = 'toolbar-key-label';
    label.textContent = title || '';
    btn.appendChild(label);
    for (const { id: gestureId, actionId: gestureActionId, position } of
      getToolbarGestureIndicatorEntries(style)) {
      const gestureIcon = getToolbarGestureIcon(
        gestureActionId,
        style.gestureActionIcons?.[gestureId] ||
          (gestureId === 'swipeUp' ? style.gestureActionIconSvg : ''),
        toolbarConfig
      );
      if (gestureIcon) {
        const marker = document.createElement('span');
        marker.className =
          `toolbar-key-gesture-indicator toolbar-key-gesture-indicator--${position}`;
        marker.dataset.gesturePosition = position;
        marker.setAttribute('aria-hidden', 'true');
        marker.innerHTML = gestureIcon;
        btn.appendChild(marker);
      }
    }
    btn.addEventListener('pointerdown', event => {
      // Prevent toolbar interaction from stealing focus from the editor and
      // dismissing the on-screen keyboard.
      event.preventDefault();
    });
    btn.onclick = (e) => {
      e.stopPropagation();
      if (surface === 'bottom') {
        if (bottomToolbarConfig.popupGroups[styleId]) {
          togglePopupStrip(styleId, btn, getRuntimeToolbarGroupItems(styleId));
          return;
        }
      } else if (toolbarConfig.popupGroups[styleId]) {
        togglePopupStrip(
          styleId,
          btn,
          getRuntimeToolbarGroupItemsForConfig(styleId, toolbarConfig),
          toolbarConfig
        );
        return;
      }
      runToolbarGestureAction(styleId, btn, new Set(), toolbarConfig);
    };
    installPopupToolbarSwipeUp(btn, styleId, toolbarConfig);
    strip.appendChild(btn);
  });

  strip.classList.remove('hidden');
  strip.scrollLeft = 0;
  if (surface === 'floating') positionFloatingPopupStrip(targetBtn);
  refreshToolbarSyntaxState();
  const activeCommand = strip.querySelector('.popup-strip-btn.active');
  if (activeCommand) {
    const stripRect = strip.getBoundingClientRect();
    const commandRect = activeCommand.getBoundingClientRect();
    if (commandRect.left < stripRect.left + 8) {
      strip.scrollLeft -= stripRect.left + 8 - commandRect.left;
    } else if (commandRect.right > stripRect.right - 8) {
      strip.scrollLeft += commandRect.right - stripRect.right + 8;
    }
  }
}

function getToolbarSyntaxState(view) {
  if (!view?.state) return {};
  const state = getMarkdownFormattingState(view);
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head).text;
  const heading = /^\s{0,3}(#{1,6})\s+/.exec(line);
  const todo = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/.test(line);
  const numbered = /^\s*\d+[.)]\s+/.test(line);
  const bullet = /^\s*[-*+]\s+/.test(line) && !todo;
  state.paragraph = !heading && !todo && !numbered && !bullet;
  for (let level = 1; level <= 6; level++) {
    state[`heading${level}`] = Number(heading?.[1].length) === level;
  }
  state.todoList = todo;
  state.numberedList = numbered && !todo;
  state.bulletedList = bullet;
  return state;
}

function refreshToolbarSyntaxState(view = activeAdapter?.view) {
  if (!view?.state || typeof document === 'undefined') return;
  const state = getToolbarSyntaxState(view);
  document.querySelectorAll('[data-toolbar-command]').forEach(button => {
    const active = Boolean(state[button.dataset.toolbarCommand]);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const groupStates = {
    heading: Object.keys(state).some(key => /^heading[1-6]$/.test(key) && state[key]),
    lists: Boolean(state.bulletedList || state.numberedList || state.todoList),
    format: Boolean(
      state.bold || state.italic || state.strikethrough || state.underline ||
      state.code || state.highlightCycle || state.penCycle
    )
  };
  for (const [group, active] of Object.entries(groupStates)) {
    document
      .querySelectorAll(
        `#bottom-toolbar [data-toolbar-key="${group}"], #floating-selection-toolbar [data-toolbar-key="${group}"]`
      )
      .forEach(button => {
        button.classList.toggle('has-active-syntax', active);
        button.setAttribute('aria-pressed', String(active));
      });
  }
}

let regexHistory = [];
try {
  const saved = localStorage.getItem('wmdx_regex_history_v1');
  if (saved) regexHistory = JSON.parse(saved);
} catch (e) {}

function saveRegexPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return;
  const trimmed = pattern.trim();
  if (!trimmed) return;
  try {
    new RegExp(trimmed);
  } catch (e) {
    return;
  }
  regexHistory = regexHistory.filter(p => p !== trimmed);
  regexHistory.unshift(trimmed);
  if (regexHistory.length > 20) regexHistory = regexHistory.slice(0, 20);
  try {
    localStorage.setItem('wmdx_regex_history_v1', JSON.stringify(regexHistory));
  } catch (e) {}
}

function clearRegexHistory() {
  regexHistory = [];
  try {
    localStorage.removeItem('wmdx_regex_history_v1');
  } catch (e) {}
}

function showRegexHistoryPopup(anchorBtn, searchInput) {
  let popup = document.querySelector('#regex-history-popup');
  if (popup) popup.remove();

  popup = document.createElement('div');
  popup.id = 'regex-history-popup';
  popup.style.cssText = `
    position: fixed;
    z-index: 10009;
    background: var(--findreplace-panel-bg, #222428);
    border: 1px solid var(--findreplace-panel-border, rgba(255,255,255,0.2));
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    max-height: 240px;
    overflow-y: auto;
    min-width: 180px;
    color: var(--text-color, #ffffff);
    font-size: 13px;
  `;

  if (regexHistory.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'padding: 6px 10px; color: #888; font-style: italic;';
    emptyMsg.textContent = 'No regex history';
    popup.appendChild(emptyMsg);
  } else {
    regexHistory.forEach(pat => {
      const item = document.createElement('div');
      item.className = 'regex-history-item';
      item.style.cssText = 'padding: 6px 10px; cursor: pointer; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace;';
      item.textContent = pat;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.value = pat;
        popup.remove();
        commitSearchQuery();
      });
      popup.appendChild(item);
    });

    const clearBtn = document.createElement('button');
    clearBtn.style.cssText = 'padding: 4px 8px; margin-top: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; cursor: pointer; font-size: 11px; align-self: flex-end;';
    clearBtn.textContent = 'Clear history';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRegexHistory();
      popup.remove();
    });
    popup.appendChild(clearBtn);
  }

  document.body.appendChild(popup);

  const rect = anchorBtn.getBoundingClientRect();
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 10))}px`;

  const closePopup = (e) => {
    if (!popup.contains(e.target) && e.target !== anchorBtn) {
      popup.remove();
      window.removeEventListener('pointerdown', closePopup);
    }
  };
  window.addEventListener('pointerdown', closePopup);
}

let searchState = {
  matchCase: false,
  wholeWords: false,
  useRegex: false,
  highlightAll: true
};

function sanitizeSvg(svgString) {
  if (!svgString || typeof svgString !== 'string') return null;
  const trimmed = svgString.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return null;

  if (/<script/i.test(trimmed) ||
      /<foreignObject/i.test(trimmed) ||
      /\son\w+=/i.test(trimmed) ||
      /javascript:/i.test(trimmed) ||
      /data:/i.test(trimmed) ||
      /<embed/i.test(trimmed) ||
      /<object/i.test(trimmed) ||
      /<iframe/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

let countDebounceTimer = null;

function buildSearchQuery(searchInput, replaceInput) {
  return new SearchQuery({
    search: searchInput.value || '',
    replace: replaceInput.value || '',
    caseSensitive: searchState.matchCase,
    wholeWord: searchState.wholeWords,
    regexp: searchState.useRegex
  });
}

function runFindAndCenter(command, view) {
  if (!view || !command(view)) return false;
  const { head } = view.state.selection.main;
  view.dispatch({
    effects: EditorView.scrollIntoView(head, { y: 'center', yMargin: 20 })
  });
  return true;
}

function commitSearchQuery() {
  const container = document.querySelector('#custom-search-bar');
  if (!container || !activeAdapter || !activeAdapter.view) return false;

  const searchInput = container.querySelector('#search-input');
  const replaceInput = container.querySelector('#replace-input');
  const view = activeAdapter.view;

  const query = buildSearchQuery(searchInput, replaceInput);

  if (searchState.useRegex && searchInput.value) {
    saveRegexPattern(searchInput.value);
  }

  if (!query.search) {
    clearInlineSearchError();
    clearMatchCounter();
    view.dispatch({ effects: setSearchQuery.of(query) });
    return true;
  }

  if (!query.valid) {
    if (searchState.useRegex) {
      showInlineSearchError('Invalid regular expression');
    }
    return false;
  }

  clearInlineSearchError();
  view.dispatch({ effects: setSearchQuery.of(query) });
  updateMatchCounterFromQuery(query, view);
  return true;
}

function updateMatchCounterFromQuery(query, view) {
  if (countDebounceTimer) clearTimeout(countDebounceTimer);

  countDebounceTimer = setTimeout(() => {
    if (!query || !query.search || !query.valid) {
      clearMatchCounter();
      return;
    }

    const state = view.state;
    const cursor = query.getCursor(state);
    const selectionHead = state.selection.main.head;

    let total = 0;
    let currentMatchIndex = 0;
    const MAX_COUNT = 10000;

    let match = cursor.next();
    while (!match.done) {
      total++;
      if (match.value.from <= selectionHead && selectionHead <= match.value.to) {
        currentMatchIndex = total;
      }
      if (total >= MAX_COUNT) break;
      match = cursor.next();
    }

    const counterEl = document.querySelector('#search-counter');
    if (counterEl) {
      if (total === 0) {
        counterEl.textContent = '0/0';
      } else if (total >= MAX_COUNT) {
        counterEl.textContent = `${currentMatchIndex || 1}/10000+`;
      } else {
        counterEl.textContent = `${currentMatchIndex || 1}/${total}`;
      }
    }
  }, 80);
}

function clearMatchCounter() {
  const counterEl = document.querySelector('#search-counter');
  if (counterEl) counterEl.textContent = '';
}

function showInlineSearchError(msg) {
  const errEl = document.querySelector('#search-error-msg');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
  const counterEl = document.querySelector('#search-counter');
  if (counterEl) counterEl.textContent = 'Error';
}

function clearInlineSearchError() {
  const errEl = document.querySelector('#search-error-msg');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }
}

function attachButtonBehavior(btn, description, onClickAction, isRegexBtn = false) {
  if (!btn) return;
  let timer = null;
  let startX = 0, startY = 0;
  let triggered = false;

  btn.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    triggered = false;
    timer = setTimeout(() => {
      triggered = true;
      if (isRegexBtn) {
        const searchInput = document.querySelector('#search-input');
        showRegexHistoryPopup(btn, searchInput);
      } else {
        if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
          window.AndroidNative.showToast(description);
        }
      }
    }, 500);
  });

  btn.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
      clearTimeout(timer);
      timer = null;
    }
  });

  const cancelTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  btn.addEventListener('pointerup', cancelTimer);
  btn.addEventListener('pointercancel', cancelTimer);

  btn.addEventListener('click', (e) => {
    if (triggered) {
      e.preventDefault();
      e.stopPropagation();
      triggered = false;
      return;
    }
    onClickAction(e);
  });
}

let isSearchBarInitialized = false;

function initCustomSearchBar() {
  if (isSearchBarInitialized) return;
  const container = document.querySelector('#custom-search-bar');
  if (!container) return;
  isSearchBarInitialized = true;

  const searchInput = container.querySelector('#search-input');
  const replaceInput = container.querySelector('#replace-input');
  const btnPrev = container.querySelector('#search-btn-prev');
  const btnNext = container.querySelector('#search-btn-next');
  const btnHighlight = container.querySelector('#search-btn-highlight');
  const btnRegex = container.querySelector('#search-btn-regex');
  const btnClose = container.querySelector('#search-btn-close');
  const btnReplaceOne = container.querySelector('#search-btn-replace-one');
  const btnReplaceAll = container.querySelector('#search-btn-replace-all');
  const btnCase = container.querySelector('#search-btn-case');
  const btnWord = container.querySelector('#search-btn-word');

  searchInput.addEventListener('input', () => commitSearchQuery());
  replaceInput.addEventListener('input', () => commitSearchQuery());

  attachButtonBehavior(btnPrev, 'Find Previous match in document', () => {
    if (activeAdapter && activeAdapter.view) {
      runFindAndCenter(findPrevious, activeAdapter.view);
      const query = buildSearchQuery(searchInput, replaceInput);
      updateMatchCounterFromQuery(query, activeAdapter.view);
    }
  });

  attachButtonBehavior(btnNext, 'Find Next match in document', () => {
    if (activeAdapter && activeAdapter.view) {
      runFindAndCenter(findNext, activeAdapter.view);
      const query = buildSearchQuery(searchInput, replaceInput);
      updateMatchCounterFromQuery(query, activeAdapter.view);
    }
  });

  attachButtonBehavior(btnHighlight, 'Toggle Highlight All Matches', () => {
    searchState.highlightAll = !searchState.highlightAll;
    btnHighlight.classList.toggle('active', searchState.highlightAll);
    if (searchState.highlightAll) {
      document.body.classList.remove('cm-search-hide-matches');
    } else {
      document.body.classList.add('cm-search-hide-matches');
    }
    commitSearchQuery();
  });

  attachButtonBehavior(btnRegex, 'Toggle Regular Expression (Hold: History)', () => {
    searchState.useRegex = !searchState.useRegex;
    btnRegex.classList.toggle('active', searchState.useRegex);
    commitSearchQuery();
  }, true);

  attachButtonBehavior(btnClose, 'Close Search bar', () => {
    toggleFindAndReplaceBar(false);
  });

  attachButtonBehavior(btnReplaceOne, 'Replace currently selected match', () => {
    if (activeAdapter && activeAdapter.view) {
      replaceNext(activeAdapter.view);
      commitSearchQuery();
    }
  });

  attachButtonBehavior(btnReplaceAll, 'Replace all occurrences in document', () => {
    if (activeAdapter && activeAdapter.view) {
      replaceAll(activeAdapter.view);
      commitSearchQuery();
    }
  });

  attachButtonBehavior(btnCase, 'Toggle Match Case', () => {
    searchState.matchCase = !searchState.matchCase;
    btnCase.classList.toggle('active', searchState.matchCase);
    commitSearchQuery();
  });

  attachButtonBehavior(btnWord, 'Toggle Match Whole Word', () => {
    searchState.wholeWords = !searchState.wholeWords;
    btnWord.classList.toggle('active', searchState.wholeWords);
    commitSearchQuery();
  });
}

function toggleFindAndReplaceBar(forceState) {
  const bar = document.getElementById('custom-search-bar');
  if (!bar) return;

  const show = forceState ?? bar.classList.contains('hidden');
  bar.classList.toggle('hidden', !show);

  const view = activeAdapter?.view;
  if (!view) return;

  if (show) {
    openSearchPanel(view);
    requestAnimationFrame(() => {
      const input = bar.querySelector('#search-input');
      input?.focus();
      input?.select();
      commitSearchQuery();
    });
  } else {
    // Intentionally do not call closeSearchPanel(view): that detaches
    // the custom #custom-search-bar element from CodeMirror's panel host.
    view.focus();
  }
}

function setupFastScrollbar() {
  const mainArea = document.querySelector('.cm-scroller');
  const track = document.querySelector('#fast-scrollbar-track');
  const thumb = document.querySelector('#fast-scrollbar-thumb');
  if (!mainArea || !track || !thumb) return () => {};

  let lastScrollTop = mainArea.scrollTop;
  let lastScrollTime = Date.now();
  let hideTimer = null;
  let isDragging = false;
  let dragPointerId = null;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  let thumbUpdateFrame = null;

  const updateThumbPosition = () => {
    const scrollHeight = mainArea.scrollHeight;
    const clientHeight = mainArea.clientHeight;
    if (scrollHeight <= clientHeight + 10) return;

    const maxScroll = scrollHeight - clientHeight;
    const scrollRatio = Math.min(1, Math.max(0, mainArea.scrollTop / maxScroll));

    const trackHeight = track.clientHeight || window.innerHeight;
    const thumbHeight = thumb.clientHeight || 60;
    const availableTrack = trackHeight - thumbHeight;

    thumb.style.top = `${scrollRatio * availableTrack}px`;
  };

  const scheduleThumbPosition = () => {
    if (thumbUpdateFrame !== null) return;
    thumbUpdateFrame = requestAnimationFrame(() => {
      thumbUpdateFrame = null;
      if (mainArea.isConnected) updateThumbPosition();
    });
  };

  const onScroll = () => {
    if (isDragging) return;

    const now = Date.now();
    const dt = now - lastScrollTime;
    const dy = Math.abs(mainArea.scrollTop - lastScrollTop);
    const velocity = dt > 0 ? (dy / dt) : 0;

    lastScrollTop = mainArea.scrollTop;
    lastScrollTime = now;

    if (velocity > 4.5 || dy > 250) {
      scheduleThumbPosition();
      track.classList.add('visible');

      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (!isDragging) {
          track.classList.remove('visible');
        }
      }, 1200);
    }
  };
  mainArea.addEventListener('scroll', onScroll, { passive: true });

  const onPointerDown = (e) => {
    isDragging = true;
    dragPointerId = e.pointerId;
    dragStartY = e.clientY;
    dragStartScrollTop = mainArea.scrollTop;
    thumb.setPointerCapture?.(e.pointerId);
    track.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = null;
  };
  thumb.addEventListener('pointerdown', onPointerDown);

  const onPointerMove = (e) => {
    if (!isDragging || (dragPointerId !== null && e.pointerId !== dragPointerId)) return;
    const deltaY = e.clientY - dragStartY;

    const trackHeight = track.clientHeight || window.innerHeight;
    const thumbHeight = thumb.clientHeight || 60;
    const availableTrack = trackHeight - thumbHeight;

    const scrollHeight = mainArea.scrollHeight;
    const clientHeight = mainArea.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    if (availableTrack > 0 && maxScroll > 0) {
      const scrollDelta = (deltaY / availableTrack) * maxScroll;
      mainArea.scrollTop = Math.min(maxScroll, Math.max(0, dragStartScrollTop + scrollDelta));
      updateThumbPosition();
    }
  };
  thumb.addEventListener('pointermove', onPointerMove);

  const stopDrag = (event) => {
    if (event && dragPointerId !== null && event.pointerId !== dragPointerId) return;
    if (isDragging) {
      isDragging = false;
      dragPointerId = null;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        track.classList.remove('visible');
      }, 1200);
    }
  };

  thumb.addEventListener('pointerup', stopDrag);
  thumb.addEventListener('pointercancel', stopDrag);

  return () => {
    mainArea.removeEventListener('scroll', onScroll);
    thumb.removeEventListener('pointerdown', onPointerDown);
    thumb.removeEventListener('pointermove', onPointerMove);
    thumb.removeEventListener('pointerup', stopDrag);
    thumb.removeEventListener('pointercancel', stopDrag);
    clearTimeout(hideTimer);
    hideTimer = null;
    if (thumbUpdateFrame !== null) {
      cancelAnimationFrame(thumbUpdateFrame);
      thumbUpdateFrame = null;
    }
    if (dragPointerId !== null && thumb.hasPointerCapture?.(dragPointerId)) {
      try {
        thumb.releasePointerCapture(dragPointerId);
      } catch (_) {
        // The pointer may have been released by the browser already.
      }
    }
    dragPointerId = null;
    isDragging = false;
    track.classList.remove('visible');
  };
}

function updateTocActiveSection() {
  const tocContent = document.querySelector('#toc-content');
  const panel = document.querySelector('#toc-panel');
  const tocSearchInput = document.querySelector('#toc-search-input');
  const isSearching = Boolean(tocSearchInput?.value.trim());
  if (
    !tocContent ||
    !panel?.classList.contains('open') ||
    !activeAdapter ||
    !activeAdapter.view
  ) {
    return;
  }

  const view = activeAdapter.view;
  const doc = view.state.doc;
  const scrollRect = view.scrollDOM.getBoundingClientRect();
  const isAtDocumentTop = view.scrollDOM.scrollTop <= 1;
  let activePosition = null;
  if (
    !isAtDocumentTop &&
    scrollRect.height > 0 &&
    typeof view.posAtCoords === 'function'
  ) {
    const anchorY =
      scrollRect.top +
      scrollRect.height * 0.30 +
      Math.min(8, scrollRect.height * 0.02);
    const anchorX = scrollRect.left + Math.min(scrollRect.width * 0.12, 24);
    try {
      activePosition = view.posAtCoords({ x: anchorX, y: anchorY }, false);
    } catch (_) {
      activePosition = null;
    }
  }
  if (!isAtDocumentTop && !Number.isFinite(activePosition)) {
    activePosition = view.state.selection.main.head;
  }

  const rows = Array.from(tocContent.querySelectorAll('.toc-item'));
  let activeRow = null;
  rows.forEach(row => row.classList.remove('active-section'));
  if (isAtDocumentTop) {
    activeRow = rows[0] || null;
  } else {
    const currentLine = doc.lineAt(activePosition).number - 1;
    rows.forEach(row => {
      const idx = parseInt(row.dataset.lineIndex, 10);
      if (!isNaN(idx) && currentLine >= idx) {
        activeRow = row;
      }
    });
  }

  if (activeRow) {
    let activeHeadingChanged = activeRow.dataset.headingKey !== tocExpansionState.activeHeadingKey;
    if (!isSearching && typeof revealActiveTocHeading === 'function') {
      activeHeadingChanged = revealActiveTocHeading(activeRow) || activeHeadingChanged;
    }
    activeRow.classList.add('active-section');

    if (!isSearching && (activeHeadingChanged || tocExpansionState.centerOnNextUpdate)) {
      const containerRect = tocContent.getBoundingClientRect();
      const rowRect = activeRow.getBoundingClientRect();
      if (containerRect.height > 0 && rowRect.height > 0 && tocContent.clientHeight > 0) {
        const rowCenter = tocContent.scrollTop +
          rowRect.top -
          containerRect.top +
          rowRect.height / 2;
        const maxScrollTop = Math.max(
          0,
          tocContent.scrollHeight - tocContent.clientHeight
        );
        tocContent.scrollTop = Math.max(
          0,
          Math.min(maxScrollTop, rowCenter - tocContent.clientHeight / 2)
        );
      }
    }
    tocExpansionState.centerOnNextUpdate = false;
  }
}

function setupTocGestureAndPanel(scrollDOM) {
  const win = document.defaultView || window;
  const panel = document.querySelector('#toc-panel');
  const overlay = document.querySelector('#toc-overlay');
  const tocContent = document.querySelector('#toc-content');
  const globalToggleBtn = document.querySelector('#toc-global-toggle');
  const documentNameInput = document.querySelector('#toc-document-name');
  const settingsButton = document.querySelector('#toc-settings-button');
  const historyBackButton = document.querySelector('#toc-history-back');
  const historyForwardButton = document.querySelector('#toc-history-forward');
  const documentStatsRow = document.querySelector('#toc-document-stats');
  const tocSearchInput = document.querySelector('#toc-search-input');
  if (!panel || !overlay) return () => {};
  panel.classList.toggle('panel-disabled', !tocPanelEnabled);
  overlay.classList.toggle('panel-disabled', !tocPanelEnabled);

  let pendingRefreshTimer = null;
  let tocScrollFrame = null;
  const tocScrollHandler = () => {
    if (!panel.classList.contains('open') || tocScrollFrame !== null) return;
    tocScrollFrame = requestAnimationFrame(() => {
      tocScrollFrame = null;
      if (activeAdapter?.view?.scrollDOM === scrollDOM) {
        updateTocActiveSection();
      }
    });
  };
  scrollDOM?.addEventListener('scroll', tocScrollHandler, { passive: true });
  const hasDescendantHeading = (rows, rowIndex) => {
    const level = parseInt(rows[rowIndex]?.dataset.level, 10) || 1;
    for (let childIndex = rowIndex + 1; childIndex < rows.length; childIndex++) {
      const childLevel = parseInt(rows[childIndex].dataset.level, 10) || 1;
      if (childLevel <= level) break;
      return true;
    }
    return false;
  };

  const cancelDocumentNameEdit = () => {
    if (!documentNameInput) return;
    documentNameInput.value = documentNameInput.dataset.committedName || documentNameInput.value;
    documentNameInput.readOnly = true;
    delete documentNameInput.dataset.editing;
  };

  const beginDocumentNameEdit = () => {
    if (!documentNameInput || !documentNameInput.readOnly) return;
    documentNameInput.readOnly = false;
    documentNameInput.dataset.editing = 'true';
    documentNameInput.focus();
    documentNameInput.select();
  };

  const commitDocumentNameEdit = () => {
    if (!documentNameInput || !documentNameInput.dataset.editing) return;
    const requestedName = documentNameInput.value.trim();
    const committedName = documentNameInput.dataset.committedName || '';
    documentNameInput.readOnly = true;
    delete documentNameInput.dataset.editing;
    if (!requestedName || requestedName === committedName) {
      cancelDocumentNameEdit();
      return;
    }
    if (
      window.AndroidNative &&
      typeof window.AndroidNative.renameCurrentDocument === 'function'
    ) {
      window.AndroidNative.renameCurrentDocument(requestedName);
    } else {
      cancelDocumentNameEdit();
    }
  };

  const openToc = () => {
    if (!tocPanelEnabled) return;
    window.leftPanelController?.close?.();
    if (activeAdapter?.view?.contentDOM) {
      activeAdapter.view.contentDOM.blur();
    }
    if (window.AndroidNative && typeof window.AndroidNative.hideKeyboard === 'function') {
      window.AndroidNative.hideKeyboard();
    }
    panel.classList.add('open');
    overlay.classList.add('open');
    tocExpansionState.centerOnNextUpdate = true;
    buildTocTree();
    updateTocHistoryButtons();
  };

  const closeToc = () => {
    if (documentNameInput && !documentNameInput.readOnly) {
      cancelDocumentNameEdit();
      documentNameInput.blur();
    }
    if (document.activeElement === tocSearchInput) {
      tocSearchInput.blur();
      window.AndroidNative?.hideKeyboard?.();
    }
    panel.classList.remove('open');
    overlay.classList.remove('open');
  };
  window.closeTocPanel = closeToc;

  overlay.onclick = closeToc;
  const onDocumentNameClick = () => beginDocumentNameEdit();
  const onDocumentNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDocumentNameEdit();
      documentNameInput?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelDocumentNameEdit();
      documentNameInput?.blur();
    }
  };
  const onDocumentNameBlur = () => {
    if (documentNameInput && !documentNameInput.readOnly) cancelDocumentNameEdit();
  };
  if (documentNameInput) {
    documentNameInput.addEventListener('click', onDocumentNameClick);
    documentNameInput.addEventListener('keydown', onDocumentNameKeyDown);
    documentNameInput.addEventListener('blur', onDocumentNameBlur);
  }
  if (tocSearchInput) {
    tocSearchInput.addEventListener('input', () => {
      applyTocCollapseState();
      updateTocActiveSection();
    });
    tocSearchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        tocSearchInput.value = '';
        applyTocCollapseState();
        updateTocActiveSection();
      }
    });
  }

  const onSettingsClick = () => {
    cancelDocumentNameEdit();
    documentNameInput?.blur();
    window.AndroidNative?.hideKeyboard?.();
    if (window.AndroidNative && typeof window.AndroidNative.onNativeAction === 'function') {
      window.AndroidNative.onNativeAction('toc_settings');
    }
  };
  const onHistoryBackClick = () => {
    cancelDocumentNameEdit();
    documentNameInput?.blur();
    window.AndroidNative?.hideKeyboard?.();
    if (!navigateTocHistory('back') && window.AndroidNative) {
      window.AndroidNative.onNativeAction('history_back');
    }
  };
  const onHistoryForwardClick = () => {
    cancelDocumentNameEdit();
    documentNameInput?.blur();
    window.AndroidNative?.hideKeyboard?.();
    if (!navigateTocHistory('forward') && window.AndroidNative) {
      window.AndroidNative.onNativeAction('history_forward');
    }
  };
  if (settingsButton) settingsButton.addEventListener('click', onSettingsClick);
  if (historyBackButton) historyBackButton.addEventListener('click', onHistoryBackClick);
  if (historyForwardButton) historyForwardButton.addEventListener('click', onHistoryForwardClick);
  updateTocHistoryButtons();

  let globalToggleHandler = null;
  if (globalToggleBtn) {
    globalToggleHandler = () => {
      tocExpansionState.isAllCollapsed = !tocExpansionState.isAllCollapsed;
      if (!tocExpansionState.isAllCollapsed) {
        tocExpansionState.collapsedHeadingKeys.clear();
      }
      applyTocCollapseState();
    };
    globalToggleBtn.onclick = globalToggleHandler;
  }

  const cleanupPanelSwipe = setupPanelSwipe({
    panel,
    overlay,
    side: 'right',
    windowObject: win,
    isOpen: () => panel.classList.contains('open'),
    isEnabled: () => tocPanelEnabled,
    onOpen: openToc,
    onClose: closeToc
  });

  function buildTocTree() {
    if (!tocContent || !activeAdapter) return;
    tocContent.innerHTML = '';

    const markdown = activeAdapter.getMarkdown();
    const counts = countDocumentText(markdown);
    if (documentStatsRow) {
      documentStatsRow.textContent = '';
      const words = document.createElement('span');
      words.textContent = `Words: ${counts.words.toLocaleString()}`;
      const characters = document.createElement('span');
      characters.textContent = `Characters: ${counts.characters.toLocaleString()}`;
      documentStatsRow.append(words, characters);
    }
    const items = extractTocHeadings(markdown);

    if (items.length === 0) {
      tocExpansionState.collapsedHeadingKeys.clear();
      tocExpansionState.initialized = false;
      tocExpansionState.activeHeadingKey = null;
      tocContent.innerHTML = '<div style="padding:16px;color:#888;font-size:14px;">No headings in document.</div>';
      return;
    }

    const occurrences = new Map();
    const itemKeys = items.map(item => {
      const baseKey = JSON.stringify([item.level, item.title]);
      const occurrence = occurrences.get(baseKey) || 0;
      occurrences.set(baseKey, occurrence + 1);
      return JSON.stringify([item.level, item.title, occurrence]);
    });
    const validKeys = new Set(itemKeys);
    for (const key of tocExpansionState.collapsedHeadingKeys) {
      if (!validKeys.has(key)) tocExpansionState.collapsedHeadingKeys.delete(key);
    }
    if (!tocExpansionState.initialized) {
      tocExpansionState.collapsedHeadingKeys.clear();
      items.forEach((item, index) => {
        const hasChildren =
          index + 1 < items.length &&
          items[index + 1].level > item.level;
        if (hasChildren && item.level >= tocDefaultHeadingLevel) {
          tocExpansionState.collapsedHeadingKeys.add(itemKeys[index]);
        }
      });
      tocExpansionState.isAllCollapsed = false;
      tocExpansionState.initialized = true;
    }

    items.forEach((item, index) => {
      const itemRow = document.createElement('div');
      itemRow.className = `toc-item level-${item.level}`;
      itemRow.dataset.level = item.level;
      itemRow.dataset.lineIndex = item.lineIndex;
      itemRow.dataset.headingKey = itemKeys[index];

      const toggleSpan = document.createElement('span');
      toggleSpan.className = 'toc-toggle';
      const itemHasChildren =
        index + 1 < items.length &&
        items[index + 1].level > item.level;
      const initiallyCollapsed =
        tocExpansionState.collapsedHeadingKeys.has(itemKeys[index]);
      toggleSpan.textContent = initiallyCollapsed ? '+' : '-';
      toggleSpan.classList.toggle('is-collapsed', initiallyCollapsed);
      toggleSpan.setAttribute('aria-pressed', String(initiallyCollapsed));
      toggleSpan.setAttribute('aria-disabled', String(!itemHasChildren));
      toggleSpan.onclick = (e) => {
        e.stopPropagation();
        const rows = Array.from(tocContent.querySelectorAll('.toc-item'));
        const clickedIndex = rows.indexOf(itemRow);
        if (clickedIndex < 0 || !itemHasChildren) {
          return;
        }

        if (tocExpansionState.isAllCollapsed) {
          tocExpansionState.isAllCollapsed = false;
          tocExpansionState.collapsedHeadingKeys.clear();
          rows.forEach((row, rowIndex) => {
            if (hasDescendantHeading(rows, rowIndex)) {
              tocExpansionState.collapsedHeadingKeys.add(row.dataset.headingKey);
            }
          });
        }

        const isCurrentlyCollapsed =
          tocExpansionState.collapsedHeadingKeys.has(itemKeys[index]);
        if (isCurrentlyCollapsed) {
          tocExpansionState.collapsedHeadingKeys.delete(itemKeys[index]);
          const expandThroughLevel = item.level + tocExpandLevelsPerTap;
          for (let childIndex = clickedIndex + 1; childIndex < rows.length; childIndex++) {
            const child = rows[childIndex];
            const childLevel = parseInt(child.dataset.level, 10) || 1;
            if (childLevel <= item.level) break;
            if (!hasDescendantHeading(rows, childIndex)) continue;
            if (childLevel >= expandThroughLevel) {
              tocExpansionState.collapsedHeadingKeys.add(child.dataset.headingKey);
            } else {
              tocExpansionState.collapsedHeadingKeys.delete(child.dataset.headingKey);
            }
          }
        } else {
          tocExpansionState.collapsedHeadingKeys.add(itemKeys[index]);
        }
        applyTocCollapseState();
      };

      const textSpan = document.createElement('span');
      textSpan.className = 'toc-text';
      textSpan.dataset.headingTitle = item.title;
      renderTocHeadingText(textSpan, item.title, tocSearchInput?.value);

      itemRow.appendChild(toggleSpan);
      itemRow.appendChild(textSpan);

      itemRow.onclick = () => {
        closeToc();
        if (item.lineIndex !== undefined && activeAdapter && activeAdapter.view) {
          try {
            const line = activeAdapter.view.state.doc.line(item.lineIndex + 1);
            recordTocNavigation(activeAdapter.view, line.from);
            scrollToPositionUpperMiddle(activeAdapter.view, line.from, { focus: false });
          } catch (e) {}
        }
      };

      tocContent.appendChild(itemRow);
    });

    applyTocCollapseState();
    updateTocActiveSection();
  }

  function renderTocHeadingText(textSpan, title, query) {
    const ranges = findTocMatchRanges(title, query);
    if (ranges.length === 0) {
      textSpan.textContent = title;
      return;
    }
    const fragment = document.createDocumentFragment();
    let offset = 0;
    ranges.forEach(({ from, to }) => {
      if (from > offset) fragment.appendChild(document.createTextNode(title.slice(offset, from)));
      const mark = document.createElement('mark');
      mark.className = 'toc-search-match';
      mark.textContent = title.slice(from, to);
      fragment.appendChild(mark);
      offset = to;
    });
    if (offset < title.length) fragment.appendChild(document.createTextNode(title.slice(offset)));
    textSpan.replaceChildren(fragment);
  }

  function applyTocSearchFilter(itemRows) {
    const query = tocSearchInput?.value.trim() ?? '';
    tocContent.querySelector('.toc-search-empty')?.remove();
    if (!query) {
      itemRows.forEach(row => {
        row.querySelector('.toc-toggle')?.style.removeProperty('visibility');
        renderTocHeadingText(
          row.querySelector('.toc-text'),
          row.querySelector('.toc-text')?.dataset.headingTitle ?? '',
          ''
        );
      });
      return;
    }

    const items = itemRows.map(row => ({
      level: Number(row.dataset.level) || 1,
      title: row.querySelector('.toc-text')?.dataset.headingTitle ?? ''
    }));
    const { matchingIndexes } = getTocSearchState(items, query);
    itemRows.forEach((row, index) => {
      // Keep the full heading outline present while searching; the match is
      // highlighted in context rather than replacing the outline with results.
      row.style.display = 'flex';
      const toggle = row.querySelector('.toc-toggle');
      if (toggle) toggle.style.removeProperty('visibility');
      if (matchingIndexes.has(index)) {
        renderTocHeadingText(row.querySelector('.toc-text'), items[index].title, query);
      } else {
        renderTocHeadingText(row.querySelector('.toc-text'), items[index].title, '');
      }
    });
    if (matchingIndexes.size === 0 && itemRows.length > 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'toc-search-empty';
      emptyMessage.textContent = 'No matching headings.';
      tocContent.appendChild(emptyMessage);
    } else {
      const firstMatch = itemRows[[...matchingIndexes][0]];
      if (firstMatch) {
        const containerRect = tocContent.getBoundingClientRect();
        const rowRect = firstMatch.getBoundingClientRect();
        tocContent.scrollTop +=
          rowRect.top - containerRect.top -
          (tocContent.clientHeight - rowRect.height) / 2;
      }
    }
  }

  function applyTocCollapseState() {
    if (!tocContent) return;
    const itemRows = Array.from(tocContent.querySelectorAll('.toc-item'));

    itemRows.forEach((row, rowIndex) => {
      if (!hasDescendantHeading(itemRows, rowIndex)) {
        tocExpansionState.collapsedHeadingKeys.delete(row.dataset.headingKey);
      }
    });

    if (tocExpansionState.isAllCollapsed) {
      itemRows.forEach((row, rowIndex) => {
        const level = parseInt(row.dataset.level, 10) || 1;
        const toggle = row.querySelector('.toc-toggle');
        const hasChildren = hasDescendantHeading(itemRows, rowIndex);
        row.style.display = level > 1 ? 'none' : 'flex';
        if (toggle) {
          const isCollapsed = hasChildren;
          toggle.textContent = hasChildren && isCollapsed ? '+' : '-';
          toggle.classList.toggle('is-collapsed', isCollapsed);
          toggle.setAttribute('aria-pressed', String(isCollapsed));
          toggle.setAttribute('aria-disabled', String(!hasChildren));
        }
      });
      applyTocSearchFilter(itemRows);
      return;
    }

    itemRows.forEach(row => {
      row.style.display = 'flex';
      const toggle = row.querySelector('.toc-toggle');
      if (toggle) {
        const isCollapsed =
          tocExpansionState.collapsedHeadingKeys.has(row.dataset.headingKey);
        const rowIndex = itemRows.indexOf(row);
        const hasChildren = hasDescendantHeading(itemRows, rowIndex);
        toggle.textContent = hasChildren && isCollapsed ? '+' : '-';
        toggle.classList.toggle('is-collapsed', isCollapsed);
        toggle.setAttribute('aria-pressed', String(isCollapsed));
        toggle.setAttribute('aria-disabled', String(!hasChildren));
      }
    });

    itemRows.forEach((row, index) => {
      if (!tocExpansionState.collapsedHeadingKeys.has(row.dataset.headingKey)) return;
      const level = parseInt(row.dataset.level, 10) || 1;
      for (let childIndex = index + 1; childIndex < itemRows.length; childIndex++) {
        const child = itemRows[childIndex];
        if ((parseInt(child.dataset.level, 10) || 1) <= level) break;
        child.style.display = 'none';
      }
    });
    applyTocSearchFilter(itemRows);
  }

  const revealActiveHeadingInToc = (activeRow) => {
    if (!tocContent || !activeRow) return;
    const itemRows = Array.from(tocContent.querySelectorAll('.toc-item'));
    const activeIndex = itemRows.indexOf(activeRow);
    if (activeIndex < 0) return;
    const activeKey = activeRow.dataset.headingKey;
    if (activeKey === tocExpansionState.activeHeadingKey) return false;

    tocExpansionState.activeHeadingKey = activeKey;
    tocExpansionState.isAllCollapsed = false;
    tocExpansionState.collapsedHeadingKeys.clear();

    const expandedKeys = new Set();
    itemRows.forEach((row, rowIndex) => {
      const level = parseInt(row.dataset.level, 10) || 1;
      if (level < tocDefaultHeadingLevel && hasDescendantHeading(itemRows, rowIndex)) {
        expandedKeys.add(row.dataset.headingKey);
      }
    });

    let parentLevel = parseInt(activeRow.dataset.level, 10) || 1;
    for (let rowIndex = activeIndex - 1; rowIndex >= 0; rowIndex--) {
      const level = parseInt(itemRows[rowIndex].dataset.level, 10) || 1;
      if (level < parentLevel) {
        expandedKeys.add(itemRows[rowIndex].dataset.headingKey);
        parentLevel = level;
      }
    }
    if (hasDescendantHeading(itemRows, activeIndex)) {
      expandedKeys.add(activeKey);
    }

    itemRows.forEach((row, rowIndex) => {
      if (
        hasDescendantHeading(itemRows, rowIndex) &&
        !expandedKeys.has(row.dataset.headingKey)
      ) {
        tocExpansionState.collapsedHeadingKeys.add(row.dataset.headingKey);
      }
    });
    applyTocCollapseState();
    return true;
  };
  revealActiveTocHeading = revealActiveHeadingInToc;

  const scheduleOpenPanelRefresh = () => {
    if (!panel.classList.contains('open')) return false;
    if (pendingRefreshTimer !== null) win.clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = win.setTimeout(() => {
      pendingRefreshTimer = null;
      if (panel.classList.contains('open')) buildTocTree();
    }, 100);
    return true;
  };
  refreshOpenTocPanel = scheduleOpenPanelRefresh;

  return () => {
    cleanupPanelSwipe();
    if (pendingRefreshTimer !== null) {
      win.clearTimeout(pendingRefreshTimer);
      pendingRefreshTimer = null;
    }
    if (tocScrollFrame !== null) {
      cancelAnimationFrame(tocScrollFrame);
      tocScrollFrame = null;
    }
    scrollDOM?.removeEventListener('scroll', tocScrollHandler);
    if (refreshOpenTocPanel === scheduleOpenPanelRefresh) {
      refreshOpenTocPanel = null;
    }
    if (revealActiveTocHeading === revealActiveHeadingInToc) {
      revealActiveTocHeading = null;
    }
    if (overlay.onclick === closeToc) overlay.onclick = null;
    if (documentNameInput) {
      documentNameInput.removeEventListener('click', onDocumentNameClick);
      documentNameInput.removeEventListener('keydown', onDocumentNameKeyDown);
      documentNameInput.removeEventListener('blur', onDocumentNameBlur);
    }
    if (settingsButton) settingsButton.removeEventListener('click', onSettingsClick);
    if (historyBackButton) historyBackButton.removeEventListener('click', onHistoryBackClick);
    if (historyForwardButton) historyForwardButton.removeEventListener('click', onHistoryForwardClick);
    if (globalToggleBtn && globalToggleBtn.onclick === globalToggleHandler) {
      globalToggleBtn.onclick = null;
    }
    isSwiping = false;
  };
}

function openWithOtherEngine() {
  const modes = ['wysiwyg', 'live_preview', 'source'];
  const nextIdx = (modes.indexOf(currentEditorMode) + 1) % modes.length;
  const targetMode = modes[nextIdx];

  setEditorMode(targetMode).then(() => {
    toggleBottomToolbar(true);
    if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
      const names = { wysiwyg: 'Pure WYSIWYG', live_preview: 'Obsidian Live Preview', source: 'Raw Source View' };
      window.AndroidNative.showToast(`Switched to ${names[targetMode]}`);
    }
  });
}

function toggleBottomToolbar(forceState) {
  const toggleBtn = document.querySelector('#floating-toggle-btn');
  const isCurrentlyHidden = document.body.classList.contains('toolbar-hidden');
  const shouldShow = forceState !== undefined ? forceState : isCurrentlyHidden;

  if (shouldShow) {
    document.body.classList.remove('toolbar-hidden');
    if (toggleBtn) toggleBtn.innerHTML = '⟩';
  } else {
    document.body.classList.add('toolbar-hidden');
    if (toggleBtn) toggleBtn.innerHTML = '⟨';
  }
  window.leftPanelController?.refreshLayout?.();
}

function setupFloatingToggle() {
  const toggleBtn = document.querySelector('#floating-toggle-btn');
  if (toggleBtn) {
    toggleBtn.dataset.toolbarStyleId = TOOLBAR_TOGGLE_STYLE_ID;
    // Delegate from the body so the toggle and dynamically recreated toolbar
    // keys use the same capture-phase tap-action path.
    installToolbarTapActions(document.body);
    installPopupToolbarSwipeUp(toggleBtn, TOOLBAR_TOGGLE_STYLE_ID);
    toggleBtn.onclick = () => {
      toggleBottomToolbar();
    };
  }
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target?.closest?.('input, textarea, select')) return;

    let direction = null;
    if (parseAndMatchHotkey(e, customHotkeys.history_back)) {
      direction = 'back';
    } else if (parseAndMatchHotkey(e, customHotkeys.history_forward)) {
      direction = 'forward';
    }
    if (!direction) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    if (!navigateTocHistory(direction) && window.AndroidNative &&
        typeof window.AndroidNative.onNativeAction === 'function') {
      window.AndroidNative.onNativeAction(
        direction === 'back' ? 'history_back' : 'history_forward'
      );
    }
  }, true);

  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const c = (e.code || '').toLowerCase();

    if (k === 'enter' || k === 'return' || c === 'enter' || c === 'numpadenter' || k === 'space' || k === 'backspace' || k === 'delete') {
      return;
    }

    if (k === 'undo' || k === 'redo' || c === 'undo' || c === 'redo' || (e.ctrlKey && (k === 'z' || k === 'y'))) {
      return;
    }

    if (parseAndMatchHotkey(e, customHotkeys.new)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('new');
    } else if (parseAndMatchHotkey(e, customHotkeys.open)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('open');
    } else if (parseAndMatchHotkey(e, customHotkeys.save_as)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('save_as');
    } else if (parseAndMatchHotkey(e, customHotkeys.save_tabs)) {
      e.preventDefault();
      void window.leftPanelController?.saveTabSession?.();
    } else if (parseAndMatchHotkey(e, customHotkeys.save_as_textpack)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('save_as_textpack');
    } else if (parseAndMatchHotkey(e, customHotkeys.export)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('export');
    } else if (parseAndMatchHotkey(e, customHotkeys.save)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('save');
    } else if (parseAndMatchHotkey(e, customHotkeys.image)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('image');
    } else if (parseAndMatchHotkey(e, customHotkeys.settings)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('settings');
    } else if (parseAndMatchHotkey(e, customHotkeys.toggle_toolbar)) {
      e.preventDefault();
      toggleBottomToolbar();
    } else if (parseAndMatchHotkey(e, customHotkeys.line_wrap)) {
      e.preventDefault();
      window.editorBridge.toggleLineWrap();
    } else if (parseAndMatchHotkey(e, customHotkeys.open_with)) {
      e.preventDefault();
      openWithOtherEngine();
    } else if (parseAndMatchHotkey(e, customHotkeys.line_numbers)) {
      e.preventDefault();
      window.editorBridge.toggleLineNumbers();
    } else if (parseAndMatchHotkey(e, customHotkeys.sourceEditing)) {
      e.preventDefault();
      setEditorMode(currentEditorMode === 'source' ? 'wysiwyg' : 'source');
    } else if (parseAndMatchHotkey(e, customHotkeys.findAndReplace)) {
      e.preventDefault();
      toggleFindAndReplaceBar();
    }

    // Formatting shortcuts
    else if (parseAndMatchHotkey(e, customHotkeys.bold)) { e.preventDefault(); execCmd('bold'); }
    else if (parseAndMatchHotkey(e, customHotkeys.italic)) { e.preventDefault(); execCmd('italic'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underline)) { e.preventDefault(); execCmd('underline'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underlineSolid)) { e.preventDefault(); execCmd('underlineSolid'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underlineDotted)) { e.preventDefault(); execCmd('underlineDotted'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underlineDashed)) { e.preventDefault(); execCmd('underlineDashed'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underlineDouble)) { e.preventDefault(); execCmd('underlineDouble'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underlineWavy)) { e.preventDefault(); execCmd('underlineWavy'); }
    else if (parseAndMatchHotkey(e, customHotkeys.strikethrough)) { e.preventDefault(); execCmd('strikethrough'); }
    else if (parseAndMatchHotkey(e, customHotkeys.code)) { e.preventDefault(); execCmd('code'); }
    else if (parseAndMatchHotkey(e, customHotkeys.link)) { e.preventDefault(); execCmd('link'); }
    else if (parseAndMatchHotkey(e, customHotkeys.footnote)) { e.preventDefault(); execCmd('InsertFootnote'); }
    else if (parseAndMatchHotkey(e, customHotkeys.callout)) { e.preventDefault(); execCmd('callout'); }
    else if (parseAndMatchHotkey(e, customHotkeys.blockQuote)) { e.preventDefault(); execCmd('blockQuote'); }
    else if (parseAndMatchHotkey(e, customHotkeys.codeBlock)) { e.preventDefault(); execCmd('codeBlock'); }
    else if (parseAndMatchHotkey(e, customHotkeys.bulletedList)) { e.preventDefault(); execCmd('bulletedList'); }
    else if (parseAndMatchHotkey(e, customHotkeys.numberedList)) { e.preventDefault(); execCmd('numberedList'); }
    else if (parseAndMatchHotkey(e, customHotkeys.todoList)) { e.preventDefault(); execCmd('todoList'); }
    else if (parseAndMatchHotkey(e, customHotkeys.indent)) { e.preventDefault(); execCmd('indent'); }
    else if (parseAndMatchHotkey(e, customHotkeys.outdent)) { e.preventDefault(); execCmd('outdent'); }
    else if (parseAndMatchHotkey(e, customHotkeys.horizontalLine)) { e.preventDefault(); execCmd('horizontalLine'); }

    // Headings shortcuts
    else if (parseAndMatchHotkey(e, customHotkeys.autoHeading)) { e.preventDefault(); execCmd('autoHeading'); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_p)) { e.preventDefault(); execCmd('heading', { value: 'paragraph' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_1)) { e.preventDefault(); execCmd('heading', { value: 'heading1' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_2)) { e.preventDefault(); execCmd('heading', { value: 'heading2' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_3)) { e.preventDefault(); execCmd('heading', { value: 'heading3' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_4)) { e.preventDefault(); execCmd('heading', { value: 'heading4' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_5)) { e.preventDefault(); execCmd('heading', { value: 'heading5' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_6)) { e.preventDefault(); execCmd('heading', { value: 'heading6' }); }

    // Wmdx highlight and pen cycles, plus optional color-specific shortcuts.
    else if (parseAndMatchHotkey(e, customHotkeys.highlightCycle)) { e.preventDefault(); execCmd('highlight', { value: 'highlightCycle' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlightYellow)) { e.preventDefault(); execCmd('highlight', { value: 'highlightYellow' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlightGreen)) { e.preventDefault(); execCmd('highlight', { value: 'highlightGreen' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlightPink)) { e.preventDefault(); execCmd('highlight', { value: 'highlightPink' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlightBlue)) { e.preventDefault(); execCmd('highlight', { value: 'highlightBlue' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.penCycle)) { e.preventDefault(); execCmd('highlight', { value: 'penCycle' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.penRed)) { e.preventDefault(); execCmd('highlight', { value: 'penRed' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.penGreen)) { e.preventDefault(); execCmd('highlight', { value: 'penGreen' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.penBlue)) { e.preventDefault(); execCmd('highlight', { value: 'penBlue' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.penPurple)) { e.preventDefault(); execCmd('highlight', { value: 'penPurple' }); }
  }, true);
}

// Global JS Bridge exposure
window.editorBridge = {
  destroy: function() {
    if (activeAdapter) {
      activeAdapter.destroy();
      activeAdapter = null;
    }
  },
  setScrollPosition: function(scrollTop) {
    if (activeAdapter) activeAdapter.setScrollPosition(scrollTop);
  },
  getScrollPosition: function() {
    return activeAdapter?.getScrollPosition?.() ?? null;
  },
  openLinkInsertionDialog: function() {
    openLinkInsertionDialog();
  },
  openCalloutInsertionDialog: function() {
    openCalloutInsertionDialog();
  },
  openFootnoteInsertionDialog: function() {
    openFootnoteInsertionDialog();
  },
  setNavigationDiagnosticsEnabled: function(enabled) {
    activeAdapter?.setNavigationDiagnosticsEnabled(Boolean(enabled));
  },
  setEditorMode: function(mode) {
    return setEditorMode(mode);
  },
  getEditorMode: function() {
    return currentEditorMode;
  },
  applyBottomToolbarConfig: function(rawConfig) {
    const nextConfig = normalizeBottomToolbarConfig(rawConfig);
    if (JSON.stringify(nextConfig) === JSON.stringify(bottomToolbarConfig)) return;
    bottomToolbarConfig = nextConfig;
    hidePopupStrip();
    setupGroupedControlBar();
  },
  applyFloatingToolbarConfig: function(rawConfig) {
    const nextConfig = normalizeBottomToolbarConfig(rawConfig);
    if (JSON.stringify(nextConfig) === JSON.stringify(floatingToolbarConfig)) return;
    floatingToolbarConfig = nextConfig;
    hidePopupStrip();
    setupFloatingSelectionToolbar();
  },
  applyToolbarConfigs: function(bottomRawConfig, floatingRawConfig) {
    const nextBottomConfig = normalizeBottomToolbarConfig(bottomRawConfig);
    const nextFloatingConfig = normalizeBottomToolbarConfig(floatingRawConfig);
    const bottomChanged =
      JSON.stringify(nextBottomConfig) !== JSON.stringify(bottomToolbarConfig);
    const floatingChanged =
      JSON.stringify(nextFloatingConfig) !== JSON.stringify(floatingToolbarConfig);
    if (!bottomChanged && !floatingChanged) return;
    bottomToolbarConfig = nextBottomConfig;
    floatingToolbarConfig = nextFloatingConfig;
    hidePopupStrip();
    if (bottomChanged) setupGroupedControlBar();
    if (floatingChanged) setupFloatingSelectionToolbar();
  },
  applyAllPreferences: function(prefsJson) {
    if (!prefsJson) return;
    const prefs = typeof prefsJson === 'string' ? JSON.parse(prefsJson) : prefsJson;
    setWmdxUnderlineSyntaxEnabled(prefs.pref_underline_use_wmdx_syntax !== false);
    if (activeAdapter?.view) {
      activeAdapter.view.dispatch({ effects: heightMapRefreshEffect.of(null) });
      refreshToolbarSyntaxState(activeAdapter.view);
    }

    // Set a CSS custom property; only append a unit to a plain numeric value.
    const setCssVar = (varName, value, unit = '') => {
      if (value === undefined || value === null || value === '' || value === 'default') {
        document.documentElement.style.removeProperty(varName);
        return;
      }

      const raw = String(value).trim();
      if (!raw || raw === 'default') {
        document.documentElement.style.removeProperty(varName);
        return;
      }

      const isPlainNumber = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(raw);
      document.documentElement.style.setProperty(varName, unit && isPlainNumber ? raw + unit : raw);
    };

    // Android ColorPickerDialog stores alpha colors as #AARRGGBB.
    // CSS 8-digit hex is #RRGGBBAA, so convert ARGB values to rgba() first.
    const androidArgbToCss = (value) => {
      if (typeof value !== 'string') return value;
      const match = /^#([0-9a-f]{8})$/i.exec(value.trim());
      if (!match) return value;

      const [alpha, red, green, blue] = match[1]
        .match(/.{2}/g)
        .map(channel => parseInt(channel, 16));

      return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    };

    if (prefs.pref_app_theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    if (prefs.pref_line_wrap === false) {
      document.body.classList.add('no-line-wrap');
    } else if (prefs.pref_line_wrap === true) {
      document.body.classList.remove('no-line-wrap');
    }
    document.body.classList.toggle(
      'list-wrap-under-text',
      prefs.pref_list_wrap_under_text === true
    );
    document.body.classList.toggle(
      'todo-hide-extra-bullet',
      prefs.pref_todo_hide_extra_bullet === true
    );
    if (typeof window.editorBridge.setLineWrap === 'function') {
      window.editorBridge.setLineWrap(prefs.pref_line_wrap !== false);
    }

    // Cursor & Selection
    setCssVar('--cursor-color', prefs.pref_cursor_color);
    setCssVar('--cursor-width', prefs.pref_cursor_width, 'px');
    setCssVar('--active-line-bg', androidArgbToCss(prefs.pref_active_line_bg_color));
    const cursorBlinkRate = String(prefs.pref_cursor_blink_rate ?? '0.8s').trim();
    setCssVar('--cursor-blink-rate', cursorBlinkRate);
    document.body.classList.toggle(
      'cursor-blink-disabled',
      Number.parseFloat(cursorBlinkRate) === 0
    );
    setCssVar('--selection-highlight-bg', androidArgbToCss(prefs.pref_selection_highlight_bg_color));
    setCssVar('--selection-highlight-text', androidArgbToCss(prefs.pref_selection_highlight_text_color));

    // Body & Paragraph
    const paragraphAlignment = prefs.pref_justify_paragraph === true
      ? 'justify'
      : (prefs.pref_paragraph_align || prefs.pref_paragraph_justify || 'left');
    setCssVar('--body-font-size', prefs.pref_body_font_size, 'px');
    setCssVar('--body-font-family', toCssFontFamily(prefs.pref_body_font_family));
    setCssVar('--body-font-weight', prefs.pref_body_font_weight ?? 400);
    setCssVar('--body-text-color', androidArgbToCss(prefs.pref_body_text_color));
    const bodyBackgroundColor = prefs.pref_body_background_color;
    setCssVar(
      '--body-background-color',
      bodyBackgroundColor && bodyBackgroundColor !== 'default'
        ? androidArgbToCss(bodyBackgroundColor)
        : undefined
    );
    setCssVar('--paragraph-line-height', prefs.pref_paragraph_line_height);
    setCssVar('--paragraph-letter-spacing', prefs.pref_letter_spacing || prefs.pref_paragraph_letter_spacing, 'px');
    setCssVar('--paragraph-align', paragraphAlignment);
    setCssVar('--paragraph-hyphens', prefs.pref_paragraph_hyphenate === true ? 'auto' : 'none');
    document.body.classList.toggle(
      'paragraph-justify-hyphenate',
      paragraphAlignment === 'justify' && prefs.pref_paragraph_hyphenate === true
    );
    setCssVar('--paragraph-indent', prefs.pref_paragraph_first_line_indent, 'px');
    setCssVar('--paragraph-margin-top', prefs.pref_paragraph_margin_top, 'px');
    setCssVar('--paragraph-margin-bottom', prefs.pref_paragraph_margin_bottom, 'px');

    // Android stores these as shared preferences. Keep the shared multiplier
    // separate from each level's base size (H1 remains larger than H6).
    const globalHeadingScale = prefs.pref_heading_scale_percent != null
      ? Number(prefs.pref_heading_scale_percent) / 100
      : null;
    setCssVar('--heading-scale', globalHeadingScale);

    setCssVar('--heading-color', androidArgbToCss(prefs.pref_heading_color));
    setCssVar('--heading-font-family', toCssFontFamily(prefs.pref_heading_font_family));
    setCssVar('--heading-font-weight', prefs.pref_font_weight_heading);
    setCssVar('--heading-align', prefs.pref_heading_align);
    setCssVar('--heading-line-height', prefs.pref_heading_line_height);
    setCssVar('--heading-letter-spacing', prefs.pref_heading_letter_spacing, 'px');
    setCssVar('--heading-word-spacing', prefs.pref_heading_word_spacing, 'px');
    setCssVar('--heading-text-transform', prefs.pref_heading_text_transform);
    const globalUnderlineStyle = prefs.pref_heading_underline_style;
    setCssVar(
      '--heading-underline-line',
      globalUnderlineStyle && globalUnderlineStyle !== 'none' ? 'underline' : 'none'
    );
    setCssVar(
      '--heading-underline-style',
      globalUnderlineStyle && globalUnderlineStyle !== 'none' ? globalUnderlineStyle : 'solid'
    );
    setCssVar('--heading-underline-thickness', prefs.pref_heading_underline_thickness, 'px');
    setCssVar('--heading-underline-color', androidArgbToCss(prefs.pref_heading_underline_color));
    setCssVar('--heading-margin-top', prefs.pref_heading_margin_top, 'px');
    setCssVar('--heading-margin-bottom', prefs.pref_heading_margin_bottom, 'px');

    // A per-level value is an override, not a multiplier. Removing that
    // preference removes its CSS variable so the global setting takes over.
    for (let i = 1; i <= 6; i++) {
      const key = `pref_heading_${i}_`;
      const pColor = prefs[key + 'color'];
      const levelScalePercent = prefs[key + 'scale_percent'];
      const oldLevelScale = prefs['pref_heading_' + i + '_scale'];
      const oldLevelFontSize = prefs['pref_heading_' + i + '_font_size'];
      const pScale = levelScalePercent != null
        ? Number(levelScalePercent) / 100
        : (oldLevelScale != null
          ? oldLevelScale
          : (oldLevelFontSize != null ? Number(oldLevelFontSize) / 16 : null));
      const pTransform =
        prefs[key + 'text_transform'] ?? prefs[key + 'transform'];
      const pUnderlineRaw = prefs[key + 'underline_style'];
      const pUnderlineEnabled = pUnderlineRaw && pUnderlineRaw !== 'none';

      setCssVar('--heading-' + i + '-color', androidArgbToCss(pColor));
      setCssVar('--heading-' + i + '-scale', pScale);
      setCssVar('--heading-' + i + '-align', prefs[key + 'align']);
      setCssVar('--heading-' + i + '-line-height', prefs[key + 'line_height']);
      setCssVar('--heading-' + i + '-letter-spacing', prefs[key + 'letter_spacing'], 'px');
      setCssVar('--heading-' + i + '-word-spacing', prefs[key + 'word_spacing'], 'px');
      setCssVar('--heading-' + i + '-text-transform', pTransform);
      setCssVar('--heading-' + i + '-underline-line', pUnderlineRaw == null ? null : (pUnderlineEnabled ? 'underline' : 'none'));
      setCssVar('--heading-' + i + '-underline-style', pUnderlineRaw == null ? null : (pUnderlineEnabled ? pUnderlineRaw : 'solid'));
      setCssVar('--heading-' + i + '-underline-thickness', prefs[key + 'underline_thickness'], 'px');
      setCssVar('--heading-' + i + '-underline-color', androidArgbToCss(prefs[key + 'underline_color']));
      setCssVar('--heading-' + i + '-margin-left', prefs[key + 'margin_left'], 'px');
      setCssVar('--heading-' + i + '-margin-right', prefs[key + 'margin_right'], 'px');
      setCssVar('--heading-' + i + '-margin-top', prefs[key + 'margin_top'], 'px');
      setCssVar('--heading-' + i + '-margin-bottom', prefs[key + 'margin_bottom'], 'px');
      setCssVar('--heading-' + i + '-font-weight', prefs[key + 'font_weight']);
      setCssVar('--heading-' + i + '-font-family', toCssFontFamily(prefs[key + 'font_family']));
    }

    // Inline formats
    setCssVar('--bold-color', prefs.pref_bold_color);
    setCssVar('--bold-font-weight', prefs.pref_font_weight_bold);
    setCssVar('--italic-color', prefs.pref_italic_color);
    setCssVar('--italic-font-weight', prefs.pref_font_weight_italic);
    const italicDecoration = prefs.pref_italic_decoration || 'none';
    setCssVar('--italic-decoration-line', italicDecoration === 'none' ? 'none' : 'underline');
    setCssVar('--italic-decoration-style', italicDecoration === 'none' ? 'solid' : italicDecoration);
    setCssVar('--link-color', prefs.pref_link_color);
    const linkStyle = prefs.pref_link_decoration || 'solid';
    setCssVar('--link-decoration-line', linkStyle === 'none' ? 'none' : 'underline');
    setCssVar('--link-decoration-style', linkStyle === 'none' ? 'solid' : linkStyle);
    setCssVar('--link-decoration-thickness', prefs.pref_link_underline_thickness, 'px');
    for (const style of ['solid', 'dotted', 'dashed', 'double', 'wavy']) {
      setCssVar(
        `--underline-${style}-color`,
        androidArgbToCss(prefs[`pref_underline_${style}_color`])
      );
      setCssVar(
        `--underline-${style}-thickness`,
        prefs[`pref_underline_${style}_thickness`],
        'px'
      );
    }
    for (const color of ['yellow', 'green', 'pink', 'blue']) {
      setCssVar(
        `--highlight-${color}-background`,
        androidArgbToCss(prefs[`pref_highlight_${color}_background_color`])
      );
      setCssVar(
        `--highlight-${color}-text`,
        androidArgbToCss(prefs[`pref_highlight_${color}_text_color`])
      );
    }
    for (const color of ['red', 'green', 'blue', 'purple']) {
      setCssVar(
        `--pen-${color}-text`,
        androidArgbToCss(prefs[`pref_pen_${color}_text_color`])
      );
    }
    setCssVar('--code-color', prefs.pref_code_color);
    setCssVar('--code-bg-color', prefs.pref_code_bg_color);
    setCssVar('--code-padding', prefs.pref_code_padding, 'px');
    setCssVar('--code-border-radius', prefs.pref_code_border_radius, 'px');

    // Footnote typography inherits paragraph/body values until overrides are enabled.
    const inheritFootnoteTypography =
      prefs.pref_footnote_inherit_body_typography !== false;
    setCssVar(
      '--footnote-font-size',
      inheritFootnoteTypography ? 'var(--body-font-size)' : prefs.pref_footnote_font_size,
      inheritFootnoteTypography ? '' : 'px'
    );
    setCssVar(
      '--footnote-font-weight',
      inheritFootnoteTypography
        ? 'var(--body-font-weight, 400)'
        : (prefs.pref_footnote_font_weight ?? 400)
    );
    setCssVar(
      '--footnote-letter-spacing',
      inheritFootnoteTypography
        ? 'var(--paragraph-letter-spacing)'
        : prefs.pref_footnote_letter_spacing
    );
    setCssVar(
      '--footnote-line-height',
      inheritFootnoteTypography
        ? 'var(--paragraph-line-height)'
        : prefs.pref_footnote_line_height
    );
    setCssVar(
      '--footnote-text-align',
      inheritFootnoteTypography
        ? paragraphAlignment
        : prefs.pref_footnote_text_align
    );
    setCssVar(
      '--footnote-text-color',
      inheritFootnoteTypography
        ? 'var(--body-text-color, var(--text-color, inherit))'
        : androidArgbToCss(prefs.pref_footnote_text_color)
    );
    setCssVar(
      '--footnote-hyphens',
      inheritFootnoteTypography
        ? 'var(--paragraph-hyphens, none)'
        : (prefs.pref_footnote_hyphenate === true ? 'auto' : 'none')
    );
    setCssVar('--footnote-bg-color', androidArgbToCss(prefs.pref_footnote_bg_color));
    setCssVar('--footnote-ref-color', androidArgbToCss(prefs.pref_footnote_ref_color));
    setCssVar('--footnote-link-color', androidArgbToCss(prefs.pref_footnote_link_color));

    // Body & Headings Margins
    setCssVar('--body-margin-left', prefs.pref_body_margin_left ?? 16, 'px');
    setCssVar('--body-margin-right', prefs.pref_body_margin_right ?? 16, 'px');
    setCssVar('--heading-margin-left', prefs.pref_heading_margin_left ?? 0, 'px');
    setCssVar('--heading-margin-right', prefs.pref_heading_margin_right ?? 0, 'px');

    // Lists
    const inheritListTypography = prefs.pref_list_inherit_body_typography !== false;
    setCssVar('--list-font-family', inheritListTypography
      ? 'var(--body-font-family, inherit)'
      : (prefs.pref_list_font_family && prefs.pref_list_font_family !== 'default'
        ? toCssFontFamily(prefs.pref_list_font_family)
        : 'inherit'));
    setCssVar('--list-font-size', inheritListTypography
      ? 'var(--body-font-size, 16px)'
      : (prefs.pref_list_font_size ?? 16), inheritListTypography ? '' : 'px');
    setCssVar('--list-font-weight', inheritListTypography
      ? 'var(--body-font-weight, 400)'
      : (prefs.pref_list_font_weight ?? 400));
    setCssVar('--list-letter-spacing', inheritListTypography
      ? 'var(--paragraph-letter-spacing, 0px)'
      : (prefs.pref_list_letter_spacing ?? '0px'));
    setCssVar('--list-text-color', inheritListTypography
      ? 'var(--body-text-color, var(--text-color, inherit))'
      : androidArgbToCss(prefs.pref_list_text_color));
    setCssVar('--list-text-align', inheritListTypography
      ? 'var(--paragraph-align, left)'
      : (prefs.pref_list_text_align && prefs.pref_list_text_align !== 'default'
        ? prefs.pref_list_text_align
        : 'var(--paragraph-align, left)'));
    setCssVar('--list-hyphens', inheritListTypography
      ? 'var(--paragraph-hyphens, none)'
      : (prefs.pref_list_hyphenate === true ? 'auto' : 'none'));
    setCssVar('--list-line-height', inheritListTypography
      ? 'var(--paragraph-line-height, 1.6)'
      : (prefs.pref_list_line_height ?? '1.5'));
    setCssVar('--list-left-indent', prefs.pref_list_left_indent, 'px');
    setCssVar('--list-margin-right', prefs.pref_list_right_margin ?? 0, 'px');
    setCssVar('--list-marker-gutter', '24px');
    setCssVar('--list-item-spacing', prefs.pref_list_item_spacing, 'px');
    setCssVar('--list-bullet-color', prefs.pref_list_bullet_color);
    setCssVar('--list-number-color', prefs.pref_list_number_color);
    setCssVar('--todo-border-color', androidArgbToCss(prefs.pref_todo_unchecked_color || prefs.pref_todo_unchecked_border_color));
    setCssVar('--todo-accent-color', androidArgbToCss(prefs.pref_todo_checked_color || prefs.pref_todo_checked_accent_color));
    setCssVar('--todo-checkmark-color', androidArgbToCss(prefs.pref_todo_checkmark_color));
    setCssVar('--todo-bg-color', androidArgbToCss(prefs.pref_todo_unchecked_bg_color));

    // Blockquotes & Callouts
    const inheritBlockquoteTypography =
      prefs.pref_blockquote_inherit_body_typography !== false;
    setCssVar('--blockquote-font-family', inheritBlockquoteTypography
      ? 'var(--body-font-family, inherit)'
      : (prefs.pref_blockquote_font_family && prefs.pref_blockquote_font_family !== 'default'
        ? toCssFontFamily(prefs.pref_blockquote_font_family)
        : 'inherit'));
    setCssVar('--blockquote-font-size', inheritBlockquoteTypography
      ? 'var(--body-font-size, 16px)'
      : (prefs.pref_blockquote_font_size ?? 16), inheritBlockquoteTypography ? '' : 'px');
    setCssVar('--blockquote-font-weight', inheritBlockquoteTypography
      ? 'var(--body-font-weight, 400)'
      : (prefs.pref_blockquote_font_weight ?? 400));
    setCssVar('--blockquote-letter-spacing', inheritBlockquoteTypography
      ? 'var(--paragraph-letter-spacing, 0px)'
      : (prefs.pref_blockquote_letter_spacing ?? '0px'));
    setCssVar('--blockquote-text-align', inheritBlockquoteTypography
      ? 'var(--paragraph-align, left)'
      : (prefs.pref_blockquote_text_align && prefs.pref_blockquote_text_align !== 'default'
        ? prefs.pref_blockquote_text_align
        : 'var(--paragraph-align, left)'));
    setCssVar('--blockquote-hyphens', inheritBlockquoteTypography
      ? 'var(--paragraph-hyphens, none)'
      : (prefs.pref_blockquote_hyphenate === true ? 'auto' : 'none'));
    setCssVar('--blockquote-line-height', inheritBlockquoteTypography
      ? 'var(--paragraph-line-height, 1.6)'
      : (prefs.pref_blockquote_line_height ?? '1.6'));
    setCssVar('--blockquote-border-width', prefs.pref_blockquote_line_thickness, 'px');
    setCssVar('--blockquote-border-style', prefs.pref_blockquote_line_style);
    setCssVar('--blockquote-border-color', prefs.pref_blockquote_line_color);
    setCssVar('--blockquote-bg-color', prefs.pref_blockquote_bg_color);
    setCssVar('--blockquote-text-color', inheritBlockquoteTypography
      ? 'var(--body-text-color, var(--text-color, inherit))'
      : androidArgbToCss(prefs.pref_blockquote_text_color));
    setCssVar(
      '--blockquote-left-margin',
      prefs.pref_blockquote_left_indent ?? prefs.pref_blockquote_left_margin ?? 0,
      'px'
    );
    setCssVar('--blockquote-right-margin', prefs.pref_blockquote_right_margin ?? 0, 'px');
    setCssVar('--blockquote-padding', prefs.pref_blockquote_padding, 'px');

    const inheritCalloutTypography =
      prefs.pref_callout_inherit_body_typography !== false;
    setCssVar('--callout-font-family', inheritCalloutTypography
      ? 'var(--body-font-family, inherit)'
      : (prefs.pref_callout_font_family && prefs.pref_callout_font_family !== 'default'
        ? toCssFontFamily(prefs.pref_callout_font_family)
        : 'inherit'));
    setCssVar('--callout-font-size', inheritCalloutTypography
      ? 'var(--body-font-size, 16px)'
      : (prefs.pref_callout_font_size ?? 16), inheritCalloutTypography ? '' : 'px');
    setCssVar('--callout-font-weight', inheritCalloutTypography
      ? 'var(--body-font-weight, 400)'
      : (prefs.pref_callout_font_weight ?? 400));
    setCssVar('--callout-letter-spacing', inheritCalloutTypography
      ? 'var(--paragraph-letter-spacing, 0px)'
      : (prefs.pref_callout_letter_spacing ?? '0px'));
    setCssVar('--callout-text-align', inheritCalloutTypography
      ? 'var(--paragraph-align, left)'
      : (prefs.pref_callout_text_align && prefs.pref_callout_text_align !== 'default'
        ? prefs.pref_callout_text_align
        : 'var(--paragraph-align, left)'));
    setCssVar('--callout-hyphens', inheritCalloutTypography
      ? 'var(--paragraph-hyphens, none)'
      : (prefs.pref_callout_hyphenate === true ? 'auto' : 'none'));
    setCssVar('--callout-line-height', inheritCalloutTypography
      ? 'var(--paragraph-line-height, 1.6)'
      : (prefs.pref_callout_line_height ?? '1.6'));
    setCssVar('--callout-border-width', prefs.pref_callout_line_thickness, 'px');
    setCssVar('--callout-border-style', prefs.pref_callout_line_style);
    setCssVar('--callout-border-color', prefs.pref_callout_line_color);
    setCssVar('--callout-bg-color', prefs.pref_callout_bg_color);
    setCssVar('--callout-text-color', inheritCalloutTypography
      ? 'var(--body-text-color, var(--text-color, inherit))'
      : androidArgbToCss(prefs.pref_callout_text_color));
    setCssVar('--callout-margin-left', prefs.pref_callout_margin_left ?? 0, 'px');
    setCssVar('--callout-margin-right', prefs.pref_callout_margin_right ?? 0, 'px');
    setCssVar('--callout-padding', prefs.pref_callout_padding, 'px');

    // Callout Shared Header
    setCssVar('--callout-header-bg', prefs.pref_callout_header_bg_color);
    setCssVar('--callout-header-title-color', prefs.pref_callout_header_title_color);
    const titleSizeVal = prefs.pref_callout_header_title_size;
    if (titleSizeVal == null || titleSizeVal == 0 || titleSizeVal === '0' || titleSizeVal === 'default') {
      document.documentElement.style.removeProperty('--callout-header-title-size');
    } else {
      setCssVar('--callout-header-title-size', titleSizeVal, 'px');
    }
    setCssVar('--callout-header-font-family', toCssFontFamily(prefs.pref_callout_header_font_family));
    setCssVar('--callout-header-font-weight', prefs.pref_callout_header_font_weight);
    setCssVar('--callout-header-padding', prefs.pref_callout_header_padding, 'px');
    setCssVar('--callout-header-accent-color', prefs.pref_callout_header_accent_color);
    setCssVar('--callout-header-accent-thickness', prefs.pref_callout_header_accent_thickness, 'px');

    // Callout Per-Type Overrides
    const calloutOverrideTypes = ['info', 'faq', 'question', 'todo', 'example'];
    const allowedCalloutIcons = ['info', 'question', 'faq', 'todo', 'example', 'note', 'tip', 'warning', 'important', 'danger'];

    calloutOverrideTypes.forEach(t => {
      setCssVar(`--callout-type-${t}-header-bg`, prefs[`pref_callout_type_${t}_bg_color`]);
      setCssVar(`--callout-type-${t}-header-title-color`, prefs[`pref_callout_type_${t}_title_color`]);
      setCssVar(`--callout-type-${t}-header-accent-color`, prefs[`pref_callout_type_${t}_accent_color`]);

      const rawIcon = prefs[`pref_callout_type_${t}_icon`];
      if (rawIcon && rawIcon !== 'default' && allowedCalloutIcons.includes(rawIcon)) {
        calloutTypeIconOverrides[t] = rawIcon;
      } else {
        delete calloutTypeIconOverrides[t];
      }
    });

    // Tables
    const inheritTableTypography =
      prefs.pref_table_inherit_body_typography !== false;
    const tableHyphenation = inheritTableTypography
      ? prefs.pref_paragraph_hyphenate === true
      : prefs.pref_table_hyphenate === true;
    document.body.classList.toggle('table-hyphenate', tableHyphenation);
    setCssVar('--table-font-family', inheritTableTypography
      ? 'var(--body-font-family, inherit)'
      : (prefs.pref_table_font_family && prefs.pref_table_font_family !== 'default'
        ? toCssFontFamily(prefs.pref_table_font_family)
        : 'inherit'));
    setCssVar('--table-font-size', inheritTableTypography
      ? 'var(--body-font-size, 16px)'
      : (prefs.pref_table_font_size ?? 15), inheritTableTypography ? '' : 'px');
    setCssVar('--table-font-weight', inheritTableTypography
      ? 'var(--body-font-weight, 400)'
      : (prefs.pref_table_font_weight ?? 400));
    setCssVar('--table-letter-spacing', inheritTableTypography
      ? 'var(--paragraph-letter-spacing, 0px)'
      : (prefs.pref_table_letter_spacing ?? '0px'));
    setCssVar('--table-line-height', inheritTableTypography
      ? 'var(--paragraph-line-height, 1.6)'
      : (prefs.pref_table_line_height ?? '1.6'));
    setCssVar('--table-hyphens', inheritTableTypography
      ? 'var(--paragraph-hyphens, none)'
      : (prefs.pref_table_hyphenate === true ? 'auto' : 'none'));
    setCssVar('--table-margin-left', prefs.pref_table_margin_left ?? 0, 'px');
    setCssVar('--table-margin-right', prefs.pref_table_margin_right ?? 0, 'px');
    setCssVar('--table-border-style', prefs.pref_table_border_style);
    setCssVar('--table-border-width', prefs.pref_table_border_thickness || prefs.pref_table_border_width, 'px');
    setCssVar('--table-border-color', prefs.pref_table_border_color);
    setCssVar('--table-header-bg', prefs.pref_table_header_bg_color || prefs.pref_table_header_bg);
    setCssVar('--table-header-color', inheritTableTypography
      ? 'var(--body-text-color, var(--text-color, inherit))'
      : androidArgbToCss(prefs.pref_table_header_text_color || prefs.pref_table_header_color));
    setCssVar('--table-header-font-weight', inheritTableTypography
      ? 'var(--body-font-weight, 400)'
      : (prefs.pref_table_header_font_weight ?? 700));
    setCssVar('--table-cell-bg', prefs.pref_table_cell_bg_color || prefs.pref_table_cell_bg);
    setCssVar('--table-cell-color', inheritTableTypography
      ? 'var(--body-text-color, var(--text-color, inherit))'
      : androidArgbToCss(prefs.pref_table_cell_text_color || prefs.pref_table_cell_color));
    setCssVar('--table-cell-padding', prefs.pref_table_cell_padding, 'px');
    setCssVar('--table-menu-bg', prefs.pref_table_menu_bg_color);
    setCssVar('--table-menu-action-bg', prefs.pref_table_menu_action_bg_color);
    setCssVar('--table-menu-text', prefs.pref_table_menu_text_color);
    setCssVar('--table-menu-disabled-color', prefs.pref_table_menu_disabled_color);
    setCssVar('--table-menu-pressed-bg', prefs.pref_table_menu_pressed_bg_color);

    // Code blocks
    setCssVar('--code-block-color', androidArgbToCss(prefs.pref_code_block_color));
    setCssVar('--code-block-bg-color', androidArgbToCss(prefs.pref_code_block_bg_color));
    setCssVar('--code-block-text-bg-color', androidArgbToCss(prefs.pref_code_block_text_bg_color));
    setCssVar('--code-block-label-bg', androidArgbToCss(prefs.pref_code_block_label_bg_color));
    setCssVar('--code-block-border-color', androidArgbToCss(prefs.pref_code_block_border_color));
    setCssVar('--code-copy-bg', androidArgbToCss(prefs.pref_code_block_copy_bg_color));
    setCssVar('--code-copy-color', androidArgbToCss(prefs.pref_code_block_copy_text_color));
    setCssVar('--code-block-font-size', prefs.pref_code_block_font_size, 'px');
    setCssVar('--code-block-font-family', toCssFontFamily(prefs.pref_code_block_font_family));
    setCssVar('--code-block-margin-left', prefs.pref_code_block_margin_left ?? 0, 'px');
    setCssVar('--code-block-margin-right', prefs.pref_code_block_margin_right ?? 0, 'px');
    setCssVar('--code-block-padding', prefs.pref_code_block_padding, 'px');
    setCssVar('--code-block-border-radius', prefs.pref_code_block_border_radius, 'px');
    setCssVar('--code-block-line-height', prefs.pref_code_block_line_height);
    setCssVar('--code-block-lang-label-color', androidArgbToCss(prefs.pref_code_block_lang_label_color));

    // Dividers
    setCssVar('--hr-margin-left', prefs.pref_hr_margin_left ?? 0, '%');
    setCssVar('--hr-margin-right', prefs.pref_hr_margin_right ?? 0, '%');
    document.body.classList.toggle(
      'hr-centered',
      prefs.pref_hr_centered === true
    );
    setCssVar('--hr-thickness', prefs.pref_hr_thickness, 'px');
    setCssVar('--hr-style', prefs.pref_hr_style);
    setCssVar('--hr-color', prefs.pref_hr_color);
    setCssVar('--hr-width', prefs.pref_hr_width_percent || prefs.pref_hr_width, '%');
    setCssVar('--hr-margin-top', prefs.pref_hr_margin_top, 'px');
    setCssVar('--hr-margin-bottom', prefs.pref_hr_margin_bottom, 'px');
    document.body.classList.toggle('hr-gradient', prefs.pref_hr_gradient_enabled === true);
    setCssVar('--hr-gradient-offset', prefs.pref_hr_gradient_offset_percent ?? 25, '%');

    // Toolbar
    floatingToolbarEnabled = prefs.pref_toolbar_floating_enabled === true;
    if (!floatingToolbarEnabled && activePopupSurface === 'floating') {
      hidePopupStrip();
    }
    if (Object.prototype.hasOwnProperty.call(prefs, 'pref_toolbar_bottom_config')) {
      const nextBottomConfig = normalizeBottomToolbarConfig(
        prefs.pref_toolbar_bottom_config
      );
      if (JSON.stringify(nextBottomConfig) !== JSON.stringify(bottomToolbarConfig)) {
        bottomToolbarConfig = nextBottomConfig;
        hidePopupStrip();
        setupGroupedControlBar();
      }
    }
    const floatingConfigPreference = prefs.pref_toolbar_floating_config ??
      prefs.pref_toolbar_bottom_config;
    if (floatingConfigPreference !== undefined) {
      const nextFloatingConfig = normalizeBottomToolbarConfig(
        floatingConfigPreference
      );
      if (JSON.stringify(nextFloatingConfig) !== JSON.stringify(floatingToolbarConfig)) {
        floatingToolbarConfig = nextFloatingConfig;
        hidePopupStrip();
        setupFloatingSelectionToolbar();
      }
    }
    setCssVar('--toolbar-bg', androidArgbToCss(prefs.pref_toolbar_bg_color));
    setCssVar('--toolbar-icon-color', prefs.pref_toolbar_icon_color);
    const activeKeyBackgroundColor = prefs.pref_toolbar_active_key_bg_color;
    if (
      typeof activeKeyBackgroundColor === 'string' &&
      activeKeyBackgroundColor !== 'default'
    ) {
      setCssVar(
        '--toolbar-key-active-bg-color',
        androidArgbToCss(activeKeyBackgroundColor)
      );
    } else {
      document.documentElement.style.removeProperty('--toolbar-key-active-bg-color');
    }
    setCssVar(
      '--toolbar-label-display',
      prefs.pref_toolbar_show_labels === true ? 'flex' : 'none'
    );
    const toolbarLabelSize = Number(prefs.pref_toolbar_label_size ?? 8);
    setCssVar(
      '--toolbar-label-size',
      Number.isFinite(toolbarLabelSize)
        ? Math.max(4, Math.min(16, toolbarLabelSize))
        : 8,
      'px'
    );
    const toolbarLabelColor = prefs.pref_toolbar_label_color;
    if (typeof toolbarLabelColor === 'string' && toolbarLabelColor !== 'default') {
      setCssVar('--toolbar-label-color', androidArgbToCss(toolbarLabelColor));
    } else {
      document.documentElement.style.removeProperty('--toolbar-label-color');
    }
    setCssVar(
      '--toolbar-toggle-bg-color',
      androidArgbToCss(prefs.pref_toolbar_toggle_bg_color)
    );
    setCssVar(
      '--toolbar-toggle-icon-color',
      androidArgbToCss(prefs.pref_toolbar_toggle_icon_color)
    );
    const toolbarHeight = Number(prefs.pref_toolbar_height ?? 48);
    const safeToolbarHeight = Number.isFinite(toolbarHeight)
      ? Math.max(36, Math.min(72, toolbarHeight))
      : 48;
    setCssVar('--toolbar-height', safeToolbarHeight, 'px');
    setCssVar(
      '--toolbar-toggle-open-size',
      Math.round((safeToolbarHeight * 34) / 48),
      'px'
    );
    const closedToggleWidth = Number(prefs.pref_toolbar_toggle_closed_width ?? 34);
    const closedToggleHeight = Number(prefs.pref_toolbar_toggle_closed_height ?? 34);
    setCssVar(
      '--toolbar-toggle-closed-width',
      Number.isFinite(closedToggleWidth)
        ? Math.max(24, Math.min(72, closedToggleWidth))
        : 34,
      'px'
    );
    setCssVar(
      '--toolbar-toggle-closed-height',
      Number.isFinite(closedToggleHeight)
        ? Math.max(24, Math.min(72, closedToggleHeight))
        : 34,
      'px'
    );
    updateFloatingSelectionToolbar();
    const toolbarPadding = Number(prefs.pref_toolbar_padding ?? 4);
    setCssVar(
      '--toolbar-padding',
      Number.isFinite(toolbarPadding) ? Math.max(0, Math.min(16, toolbarPadding)) : 4,
      'px'
    );
    setCssVar('--toolbar-floating-bg', androidArgbToCss(prefs.pref_toolbar_floating_bg_color));
    setCssVar('--toolbar-floating-icon-color', androidArgbToCss(prefs.pref_toolbar_floating_icon_color));
    setCssVar('--toolbar-floating-active-bg', androidArgbToCss(prefs.pref_toolbar_floating_active_key_bg_color));
    setCssVar('--toolbar-floating-label-color', androidArgbToCss(prefs.pref_toolbar_floating_label_color));
    setCssVar(
      '--toolbar-floating-label-display',
      prefs.pref_toolbar_floating_show_labels === true ? 'flex' : 'none'
    );
    const floatingKeyHeight = Number(prefs.pref_toolbar_floating_key_height ?? 36);
    setCssVar(
      '--toolbar-floating-key-height',
      Number.isFinite(floatingKeyHeight) ? Math.max(20, Math.min(64, floatingKeyHeight)) : 36,
      'px'
    );
    const floatingLabelSize = Number(prefs.pref_toolbar_floating_label_size ?? 8);
    setCssVar(
      '--toolbar-floating-label-size',
      Number.isFinite(floatingLabelSize) ? Math.max(6, Math.min(16, floatingLabelSize)) : 8,
      'px'
    );
    const floatingPadding = Number(prefs.pref_toolbar_floating_padding ?? 4);
    setCssVar(
      '--toolbar-floating-padding',
      Number.isFinite(floatingPadding) ? Math.max(0, Math.min(16, floatingPadding)) : 4,
      'px'
    );
    const floatingKeyWidth = Number(prefs.pref_toolbar_floating_key_width ?? 48);
    setCssVar(
      '--toolbar-floating-key-width',
      Number.isFinite(floatingKeyWidth) ? Math.max(36, Math.min(72, floatingKeyWidth)) : 48,
      'px'
    );
    const safeFloatingKeyWidth = Number.isFinite(floatingKeyWidth)
      ? Math.max(36, Math.min(72, floatingKeyWidth))
      : 48;
    const safeFloatingKeyHeight = Number.isFinite(floatingKeyHeight)
      ? Math.max(20, Math.min(64, floatingKeyHeight))
      : 36;
    setCssVar(
      '--toolbar-floating-icon-size',
      Math.max(12, Math.round(Math.min(safeFloatingKeyWidth * 0.45, safeFloatingKeyHeight - 8))),
      'px'
    );
    const floatingCornerRadius = Number(prefs.pref_toolbar_floating_corner_radius ?? 24);
    setCssVar(
      '--toolbar-floating-corner-radius',
      Number.isFinite(floatingCornerRadius)
        ? Math.max(0, Math.min(36, floatingCornerRadius))
        : 24,
      'px'
    );

    // Table of contents panel appearance
    const tocPanelWidth = Number(prefs.pref_toc_panel_width ?? 80);
    setCssVar('--toc-panel-width', Math.max(50, Math.min(90, tocPanelWidth)), 'vw');
    const nextTocDefaultHeadingLevel = Math.max(
      1,
      Math.min(6, Number(prefs.pref_toc_default_level ?? 2) || 2)
    );
    const nextTocExpandLevelsPerTap = Math.max(
      1,
      Math.min(5, Number(prefs.pref_toc_expand_levels_per_tap ?? 1) || 1)
    );
    if (nextTocDefaultHeadingLevel !== tocDefaultHeadingLevel) {
      tocDefaultHeadingLevel = nextTocDefaultHeadingLevel;
      tocExpansionState.collapsedHeadingKeys.clear();
      tocExpansionState.initialized = false;
      tocExpansionState.activeHeadingKey = null;
      tocExpansionState.centerOnNextUpdate = true;
      updateTocActiveSection();
      refreshOpenTocPanel?.();
    }
    tocExpandLevelsPerTap = nextTocExpandLevelsPerTap;
    tocHideFileExtension = prefs.pref_toc_hide_file_extension === true;
    const nextTocPanelEnabled = prefs.pref_toc_panel_enabled !== false;
    if (tocPanelEnabled && !nextTocPanelEnabled) window.closeTocPanel?.();
    tocPanelEnabled = nextTocPanelEnabled;
    document.querySelector('#toc-panel')
      ?.classList.toggle('panel-disabled', !tocPanelEnabled);
    document.querySelector('#toc-overlay')
      ?.classList.toggle('panel-disabled', !tocPanelEnabled);
    refreshTocDocumentNameField();
    setCssVar('--toc-panel-bg-color', androidArgbToCss(prefs.pref_toc_panel_bg_color));
    setCssVar('--toc-panel-bg-opacity', prefs.pref_toc_panel_bg_opacity ?? 100, '%');
    setCssVar('--toc-panel-border-color', androidArgbToCss(prefs.pref_toc_panel_border_color));
    setCssVar('--toc-history-bg-color', androidArgbToCss(prefs.pref_toc_history_bg_color));
    setCssVar('--toc-history-border-color', androidArgbToCss(prefs.pref_toc_history_border_color));
    setCssVar('--toc-history-icon-color', androidArgbToCss(prefs.pref_toc_history_icon_color));
    const tocOverlayDim = Number(prefs.pref_toc_overlay_dim ?? 50);
    setCssVar('--toc-overlay-dim', Math.max(0, Math.min(90, tocOverlayDim)) / 100);
    setCssVar('--toc-font-size', prefs.pref_toc_font_size ?? 16, 'px');
    setCssVar('--toc-font-weight', prefs.pref_toc_font_weight ?? 600);
    setCssVar('--toc-text-color', androidArgbToCss(prefs.pref_toc_text_color));
    setCssVar('--toc-active-text-color', androidArgbToCss(prefs.pref_toc_active_text_color));
    setCssVar('--toc-active-bg-color', androidArgbToCss(prefs.pref_toc_active_bg_color));
    setCssVar('--toc-search-highlight-bg-color', androidArgbToCss(prefs.pref_toc_search_highlight_bg_color));
    setCssVar('--toc-toggle-bg-color', androidArgbToCss(prefs.pref_toc_toggle_bg_color));
    setCssVar('--toc-toggle-icon-color', androidArgbToCss(prefs.pref_toc_toggle_icon_color));
    setCssVar('--toc-toggle-active-bg-color', androidArgbToCss(prefs.pref_toc_toggle_active_bg_color));
    setCssVar('--toc-toggle-active-icon-color', androidArgbToCss(prefs.pref_toc_toggle_active_icon_color));
    setCssVar('--toc-row-spacing', prefs.pref_toc_row_spacing ?? 4, 'px');
    const leftPanelWidth = Number(prefs.pref_left_panel_width ?? 80);
    setCssVar('--left-panel-width', Math.max(50, Math.min(90, leftPanelWidth)), 'vw');
    setCssVar('--left-panel-bg-color', androidArgbToCss(prefs.pref_left_panel_bg_color));
    setCssVar('--left-panel-bg-opacity', prefs.pref_left_panel_bg_opacity ?? 100, '%');
    setCssVar('--left-panel-border-color', androidArgbToCss(prefs.pref_left_panel_border_color));
    setCssVar('--left-panel-text-color', androidArgbToCss(prefs.pref_left_panel_text_color));
    setCssVar(
      '--left-panel-active-tab-text-color',
      androidArgbToCss(prefs.pref_left_panel_active_tab_text_color)
    );
    setCssVar(
      '--left-panel-active-tab-bg-color',
      androidArgbToCss(prefs.pref_left_panel_active_tab_bg_color)
    );
    setCssVar('--left-panel-font-size', prefs.pref_left_panel_font_size ?? 16, 'px');
    setCssVar('--left-panel-font-weight', prefs.pref_left_panel_font_weight ?? 600);
    setCssVar('--left-panel-row-spacing', prefs.pref_left_panel_row_spacing ?? 2, 'px');
    const leftPanelOverlayDim = Number(prefs.pref_left_panel_overlay_dim ?? 50);
    setCssVar('--left-panel-overlay-dim', Math.max(0, Math.min(90, leftPanelOverlayDim)) / 100);
    window.leftPanelController?.applyPreferences?.(prefs);
    const tocIndentSpacing = Number(prefs.pref_toc_indent_spacing ?? 12);
    for (let level = 1; level <= 6; level++) {
      setCssVar(`--toc-level-${level}-indent`, 8 + ((level - 1) * tocIndentSpacing), 'px');
    }
    const tocWrapHeadings = prefs.pref_toc_text_overflow === 'wrap';
    setCssVar('--toc-text-white-space', tocWrapHeadings ? 'normal' : 'nowrap');
    setCssVar('--toc-text-overflow', tocWrapHeadings ? 'clip' : 'ellipsis');
    setCssVar('--toc-text-overflow-wrap', tocWrapHeadings ? 'anywhere' : 'normal');

    // Find & Replace Customizations
    setCssVar('--findreplace-panel-bg', androidArgbToCss(prefs.pref_findreplace_panel_bg));
    setCssVar('--findreplace-panel-border', androidArgbToCss(prefs.pref_findreplace_panel_border));
    setCssVar('--findreplace-field-find-bg', androidArgbToCss(prefs.pref_findreplace_field_find_bg));
    setCssVar('--findreplace-field-find-color', androidArgbToCss(prefs.pref_findreplace_field_find_color));
    setCssVar('--findreplace-field-find-placeholder', androidArgbToCss(prefs.pref_findreplace_field_find_placeholder));
    setCssVar('--findreplace-field-find-border', androidArgbToCss(prefs.pref_findreplace_field_find_border));
    setCssVar('--findreplace-field-find-focus-border', androidArgbToCss(prefs.pref_findreplace_field_find_focus_border));
    setCssVar('--findreplace-field-find-font-size', prefs.pref_findreplace_field_find_font_size, 'px');
    setCssVar('--findreplace-field-replace-bg', androidArgbToCss(prefs.pref_findreplace_field_replace_bg));
    setCssVar('--findreplace-field-replace-color', androidArgbToCss(prefs.pref_findreplace_field_replace_color));
    setCssVar('--findreplace-field-replace-placeholder', androidArgbToCss(prefs.pref_findreplace_field_replace_placeholder));
    setCssVar('--findreplace-field-replace-border', androidArgbToCss(prefs.pref_findreplace_field_replace_border));
    setCssVar('--findreplace-field-replace-focus-border', androidArgbToCss(prefs.pref_findreplace_field_replace_focus_border));
    setCssVar('--findreplace-field-replace-font-size', prefs.pref_findreplace_field_replace_font_size, 'px');
    setCssVar('--findreplace-field-height', prefs.pref_findreplace_field_height, 'px');
    setCssVar('--findreplace-counter-color', androidArgbToCss(prefs.pref_findreplace_counter_color));
    setCssVar('--findreplace-counter-bg', androidArgbToCss(prefs.pref_findreplace_counter_bg));
    setCssVar('--findreplace-match-bg', androidArgbToCss(prefs.pref_findreplace_match_bg));
    setCssVar('--findreplace-current-match-bg', androidArgbToCss(prefs.pref_findreplace_current_match_bg));
    setCssVar('--findreplace-current-match-color', androidArgbToCss(prefs.pref_findreplace_current_match_color));

    const findreplaceButtons = ['prev', 'next', 'highlight', 'regex', 'close', 'replace-one', 'replace-all', 'case', 'word'];
    findreplaceButtons.forEach(bId => {
      const bKey = bId.replace(/-/g, '_');
      setCssVar(`--findreplace-${bId}-bg`, androidArgbToCss(prefs[`pref_findreplace_btn_${bKey}_bg`] || prefs.pref_findreplace_btn_bg));
      setCssVar(`--findreplace-${bId}-color`, androidArgbToCss(prefs[`pref_findreplace_btn_${bKey}_color`] || prefs.pref_findreplace_btn_color));
      setCssVar(`--findreplace-${bId}-active-bg`, androidArgbToCss(prefs[`pref_findreplace_btn_${bKey}_active_bg`] || prefs.pref_findreplace_btn_active_bg));
      setCssVar(`--findreplace-${bId}-active-color`, androidArgbToCss(prefs[`pref_findreplace_btn_${bKey}_active_color`] || prefs.pref_findreplace_btn_active_color));
      setCssVar(`--findreplace-${bId}-pressed-bg`, androidArgbToCss(prefs[`pref_findreplace_btn_${bKey}_pressed_bg`] || prefs.pref_findreplace_btn_pressed_bg));
      const buttonWidth = Number(
        prefs[`pref_findreplace_btn_${bKey}_width`] ??
        prefs.pref_findreplace_btn_width ??
        28
      );
      const safeButtonWidth = Number.isFinite(buttonWidth)
        ? Math.max(20, Math.min(64, buttonWidth))
        : 28;
      setCssVar(`--findreplace-${bId}-width`, safeButtonWidth, 'px');

      const customSvg = prefs[`pref_findreplace_btn_${bKey}_svg`];
      const btnEl = document.querySelector(`#search-btn-${bId}`);
      if (btnEl) {
        const findReplaceFieldHeight = Number(prefs.pref_findreplace_field_height ?? 32);
        const safeFieldHeight = Number.isFinite(findReplaceFieldHeight)
          ? Math.max(24, Math.min(56, findReplaceFieldHeight))
          : 32;
        const iconSize = Math.max(
          12,
          Math.round(Math.min(safeButtonWidth, safeFieldHeight) - 8)
        );
        btnEl.style.setProperty('--findreplace-icon-size', `${iconSize}px`);
        if (!btnEl.dataset.defaultSvg) {
          btnEl.dataset.defaultSvg = btnEl.innerHTML;
        }
        if (customSvg) {
          const sanitized = sanitizeSvg(customSvg);
          if (sanitized) {
            btnEl.innerHTML = sanitized;
          } else {
            btnEl.innerHTML = btnEl.dataset.defaultSvg;
          }
        } else {
          btnEl.innerHTML = btnEl.dataset.defaultSvg;
        }
      }
    });

    const applyFindReplaceButtonLayout = (prefs) => {
      let rawRow1 = prefs.pref_findreplace_button_row1;
      let rawRow2 = prefs.pref_findreplace_button_row2;
      const hiddenRaw = prefs.pref_findreplace_hidden_buttons || '';

      const knownIds = ['prev', 'next', 'highlight', 'regex', 'close', 'replace-one', 'replace-all', 'case', 'word'];
      const defaultRow1 = ['prev', 'next', 'highlight', 'regex', 'close'];
      const defaultRow2 = ['replace-one', 'replace-all', 'case', 'word'];

      if (!rawRow1 && !rawRow2 && prefs.pref_findreplace_button_order) {
        const oldOrderStr = String(prefs.pref_findreplace_button_order);
        const oldItems = oldOrderStr.split(',').map(s => s.trim()).filter(id => knownIds.includes(id));
        const dedupped = [];
        oldItems.forEach(id => { if (!dedupped.includes(id)) dedupped.push(id); });
        rawRow1 = dedupped.slice(0, 5).join(',');
        rawRow2 = dedupped.slice(5).join(',');
      }

      const r1Items = (rawRow1 || defaultRow1.join(',')).split(',').map(s => s.trim()).filter(Boolean);
      const r2Items = (rawRow2 || defaultRow2.join(',')).split(',').map(s => s.trim()).filter(Boolean);

      const row1List = [];
      const row2List = [];
      const seen = new Set();

      for (const id of r1Items) {
        if (knownIds.includes(id) && !seen.has(id)) {
          row1List.push(id);
          seen.add(id);
        }
      }

      for (const id of r2Items) {
        if (knownIds.includes(id) && !seen.has(id)) {
          row2List.push(id);
          seen.add(id);
        }
      }

      for (const id of defaultRow1) {
        if (!seen.has(id)) {
          row1List.push(id);
          seen.add(id);
        }
      }

      for (const id of defaultRow2) {
        if (!seen.has(id)) {
          row2List.push(id);
          seen.add(id);
        }
      }

      const rawHiddenList = hiddenRaw.split(',').map(s => s.trim()).filter(Boolean);
      const hiddenSet = new Set(rawHiddenList.filter(id => knownIds.includes(id)));

      const rows = document.querySelectorAll('#custom-search-bar .search-bar-row');
      if (!rows || rows.length < 2) return;

      const group1 = rows[0].querySelector('.search-icon-group');
      const group2 = rows[1].querySelector('.search-icon-group');
      if (!group1 || !group2) return;

      row1List.forEach(id => {
        const btn = document.querySelector(`#search-btn-${id}`);
        if (btn) {
          group1.appendChild(btn);
          if (hiddenSet.has(id)) {
            btn.setAttribute('hidden', '');
          } else {
            btn.removeAttribute('hidden');
          }
        }
      });

      row2List.forEach(id => {
        const btn = document.querySelector(`#search-btn-${id}`);
        if (btn) {
          group2.appendChild(btn);
          if (hiddenSet.has(id)) {
            btn.setAttribute('hidden', '');
          } else {
            btn.removeAttribute('hidden');
          }
        }
      });

      const searchBar = document.querySelector('#custom-search-bar');
      if (searchBar && !searchBar.classList.contains('hidden') && activeAdapter && activeAdapter.view) {
        commitSearchQuery();
      }
    };
    applyFindReplaceButtonLayout(prefs);

    if (activeAdapter && activeAdapter.view) {
      dispatchWithScrollSnapshot(
        activeAdapter.view,
        typographySettingsEffect.of(Date.now())
      );
      premeasureTableHeights(activeAdapter.view);
      activeAdapter.view.requestMeasure();
    }
  },
  getMarkdown: function() {
    // Flush active table cell draft if an overlay editor is open
    const activeOverlay = document.querySelector('.cm-wp-cell-editor');
    if (activeOverlay) {
      activeOverlay.blur();
    }
    if (typeof activeAdapter !== 'undefined' && activeAdapter) return activeAdapter.getMarkdown();
    if (pendingMarkdown !== null) return pendingMarkdown;
    return '';
  },
  setMarkdown: function(markdownText) {
    if (typeof activeAdapter !== 'undefined' && activeAdapter) {
      pendingMarkdown = null;
      isProgrammaticChange = true;
      try {
        activeAdapter.setMarkdown(markdownText || '');
      } catch (e) {
        console.error('Error setting markdown:', e);
      }
      window.leftPanelController?.onNativeDocumentLoaded?.(markdownText || '');
      window.AndroidNative?.restoreNativeCursorAndScrollState?.(
        activeAdapter.documentSessionId
      );
      setTimeout(() => { isProgrammaticChange = false; }, 50);
    } else {
      pendingMarkdown = markdownText;
    }
  },
  persistCurrentScrollPosition: function() {
    activeAdapter?.persistScrollPosition?.();
  },
  dismissToolbarPopups: function() {
    hidePopupStrip();
  },
  toggleLineWrap: function() {
    isLineWrapEnabled = !isLineWrapEnabled;
    window.editorBridge.setLineWrap(isLineWrapEnabled);
    if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
      window.AndroidNative.showToast(isLineWrapEnabled ? 'Line wrap enabled' : 'Line wrap disabled');
    }
  },
  setLineWrap: function(enabled) {
    isLineWrapEnabled = !!enabled;
    if (activeAdapter) {
      activeAdapter.setLineWrap(isLineWrapEnabled);
    }
  },
  toggleLineNumbers: function() {
    if (activeAdapter && typeof activeAdapter.toggleLineNumbers === 'function') {
      const state = activeAdapter.toggleLineNumbers();
      if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
        window.AndroidNative.showToast(state ? 'Line numbers enabled' : 'Line numbers disabled');
      }
    }
  },
  setHotkeys: function(hotkeysJson) {
    if (!hotkeysJson) return;
    try {
      const parsed = typeof hotkeysJson === 'string' ? JSON.parse(hotkeysJson) : hotkeysJson;
      Object.assign(customHotkeys, parsed);
    } catch (e) {
      console.error('Failed to set hotkeys:', e);
    }
  },
  getSelectionState: function() {
    if (activeAdapter) return activeAdapter.getSelectionState();
    return { path: [], offset: 0 };
  },
  setSelectionState: function(stateJson, scrollTop) {
    if (activeAdapter) activeAdapter.setSelectionState(stateJson, scrollTop);
  },
  insertImage: function(imageUrl, altText = '') {
    if (activeAdapter && typeof activeAdapter.insertImage === 'function') {
      activeAdapter.insertImage(imageUrl, altText);
    } else if (activeAdapter) {
      const imgMarkdown = `![${altText}](${imageUrl})`;
      const cur = activeAdapter.getMarkdown();
      activeAdapter.setMarkdown(cur ? `${cur}\n${imgMarkdown}` : imgMarkdown);
    }
  },
  setTheme: function(themeName) {
    if (themeName === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  },
  setDocumentTitle: function(title, documentKey) {
    const titleEl = document.querySelector('#file-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
    const displayName = String(title || '').replace(/\s+\*$/, '');
    if (documentKey !== undefined && documentKey !== null) {
      setActiveTocDocumentKey(String(documentKey));
    }
    const nameInput = document.querySelector('#toc-document-name');
    if (nameInput) {
      nameInput.dataset.fullName = displayName;
      refreshTocDocumentNameField();
    }
  },
  navigateInDocumentHistory: function(direction) {
    return direction === 'back' || direction === 'forward'
      ? navigateTocHistory(direction)
      : false;
  },
  setDocumentHistoryState: function(canGoBack, canGoForward) {
    tocDocumentHistoryState = {
      canGoBack: Boolean(canGoBack),
      canGoForward: Boolean(canGoForward)
    };
    updateTocHistoryButtons();
  },
  remapDocumentHistory: function(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    const oldHistory = tocNavigationByDocument.get(oldKey);
    const newHistory = tocNavigationByDocument.get(newKey);
    if (oldHistory && !newHistory) {
      tocNavigationByDocument.set(newKey, oldHistory);
    } else if (oldHistory && newHistory) {
      newHistory.back.push(...oldHistory.back);
      newHistory.forward.push(...oldHistory.forward);
    }
    tocNavigationByDocument.delete(oldKey);
    if (activeTocDocumentKey === oldKey) {
      activeTocDocumentKey = newKey;
      tocExpansionState.documentKey = newKey;
    }
    updateTocHistoryButtons();
  },
  setFontSettings: function(bodyFontSizePx, headingScale, boldColor, italicColor, linkColor, codeColor, codeBgColor, codeBlockColor, codeBlockBgColor, fontBodyData, fontHeadingData, fontBoldData, fontItalicData, fontCodeData, fontWeightBold, fontWeightItalic, fontWeightHeading, fontCalloutHeaderData, fontHeadingLevelsDataJson, fontTocData, fontFootnoteData, bodyFontFamily = 'default', headingFontFamily = 'default', fontOverridesJson = '{}') {
    const setCssVar = (varName, val) => {
      if (val && val !== 'default') {
        document.documentElement.style.setProperty(varName, val);
      } else {
        document.documentElement.style.removeProperty(varName);
      }
    };

    if (bodyFontSizePx) {
      document.documentElement.style.setProperty('--body-font-size', bodyFontSizePx + 'px');
    }
    if (headingScale) {
      document.documentElement.style.setProperty('--heading-scale', headingScale);
    }
    if (fontWeightBold) {
      document.documentElement.style.setProperty('--bold-font-weight', fontWeightBold);
    }
    if (fontWeightItalic) {
      document.documentElement.style.setProperty('--italic-font-weight', fontWeightItalic);
    }
    if (fontWeightHeading) {
      document.documentElement.style.setProperty('--heading-font-weight', fontWeightHeading);
    }
    setCssVar('--bold-color', boldColor);
    setCssVar('--italic-color', italicColor);
    setCssVar('--link-color', linkColor);
    setCssVar('--code-color', codeColor);
    setCssVar('--code-bg-color', codeBgColor);

    let styleEl = document.querySelector('#custom-fonts-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-fonts-style';
      document.head.appendChild(styleEl);
    }

    let fontCss = '';
    const registeredFontFamilies = new Map();
    let fontOverrides = { families: {}, files: {} };
    try {
      fontOverrides = JSON.parse(fontOverridesJson || '{}');
    } catch (error) {
      console.error('invalid_font_overrides', error);
    }
    const fontFamilies = fontOverrides.families || {};
    const fontFiles = fontOverrides.files || {};
    const applyFontCategory = (categoryName, fontData, cssVarName, deviceFont = 'default') => {
      if (fontData && fontData.length > 10) {
        let familyName = registeredFontFamilies.get(fontData);
        if (!familyName) {
          familyName = `CustomFont_${categoryName}`;
          registeredFontFamilies.set(fontData, familyName);
          fontCss += `
            @font-face {
              font-family: '${familyName}';
              src: url('${fontData}');
            }
          `;
        }
        fontCss += `.cm-content { --custom-${categoryName.toLowerCase()}-font: '${familyName}'; }\n`;
        document.documentElement.style.setProperty(cssVarName, `'${familyName}'`);
      } else {
        const familyValue = toCssFontFamily(deviceFont);
        if (familyValue) {
          document.documentElement.style.setProperty(cssVarName, familyValue);
        } else {
          document.documentElement.style.removeProperty(cssVarName);
        }
      }
    };

    applyFontCategory('Body', fontBodyData, '--body-font-family', bodyFontFamily);
    applyFontCategory('Heading', fontHeadingData, '--heading-font-family');
    applyFontCategory('Bold', fontBoldData, '--bold-font-family', fontFamilies.bold || 'default');
    applyFontCategory('Italic', fontItalicData, '--italic-font-family', fontFamilies.italic || 'default');
    applyFontCategory('Code', fontCodeData, '--code-font-family', fontFamilies.code || 'default');
    applyFontCategory('CalloutHeader', fontCalloutHeaderData, '--callout-header-font-family', fontFamilies.calloutHeader || 'default');
    applyFontCategory('Toc', fontTocData, '--toc-font-family', fontFamilies.toc || 'default');
    applyFontCategory('LeftPanel', fontFiles.leftPanel, '--left-panel-font-family', fontFamilies.leftPanel || 'default');
    applyFontCategory(
      'Footnote',
      fontFootnoteData,
      '--footnote-font-family',
      fontFamilies.footnote || bodyFontFamily
    );
    applyFontCategory('Blockquote', fontFiles.blockquote, '--blockquote-font-family', fontFamilies.blockquote || 'default');
    applyFontCategory('Callout', fontFiles.callout, '--callout-font-family', fontFamilies.callout || 'default');
    applyFontCategory('CodeBlock', fontFiles.codeBlock, '--code-block-font-family', fontFamilies.codeBlock || 'default');
    applyFontCategory('List', fontFiles.list, '--list-font-family', fontFamilies.list || 'default');
    applyFontCategory('Table', fontFiles.table, '--table-font-family', fontFamilies.table || 'default');
    let headingLevelFonts = [];
    try {
      headingLevelFonts = JSON.parse(fontHeadingLevelsDataJson || '[]');
    } catch (error) {
      console.error('invalid_heading_font_settings', error);
    }
    for (let level = 1; level <= 6; level++) {
      applyFontCategory(
        `Heading${level}`,
        headingLevelFonts[level - 1],
        `--heading-${level}-font-family`,
        fontFamilies[`heading${level}`] && fontFamilies[`heading${level}`] !== 'default'
          ? fontFamilies[`heading${level}`]
          : headingFontFamily
      );
    }

    if (styleEl.textContent !== fontCss) {
      styleEl.textContent = fontCss;
    }
  },
};

let nextTraceId = 1;

function getBlockCategory(view, pos) {
  if (!view || pos == null || pos < 0 || pos > view.state.doc.length) return 'other';
  try {
    const line = view.state.doc.lineAt(pos);
    const tree = syntaxTree(view.state);
    const node = tree.resolveInner(pos, 1);

    for (let cur = node; cur; cur = cur.parent) {
      const name = cur.name;
      if (name.startsWith('ATXHeading') || name.startsWith('SetextHeading') || name === 'HeaderMark') {
        return 'heading';
      }
      if (name === 'ListItem' || name === 'ListMark' || name === 'TaskMarker') {
        return 'list';
      }
      if (name === 'FencedCode' || name === 'CodeBlock' || name === 'CodeText') {
        return 'code';
      }
      if (name === 'Table' || name === 'TableCell') {
        return 'table';
      }
      if (name === 'Paragraph') {
        return 'paragraph';
      }
    }

    if (line.text.trim().startsWith('>')) {
      return 'callout';
    }
  } catch (e) {}
  return 'other';
}

function getSnapshot(view) {
  if (!view || !view.state) return null;
  try {
    const sel = view.state.selection.main;
    const anchor = sel.anchor;
    const head = sel.head;
    const collapsed = sel.empty;

    const anchorLineObj = view.state.doc.lineAt(anchor);
    const headLineObj = view.state.doc.lineAt(head);

    const anchorCoords = view.coordsAtPos(anchor);
    const headCoords = view.coordsAtPos(head);

    const viewRect = view.dom ? view.dom.getBoundingClientRect() : null;
    const scroller = view.scrollDOM;

    return {
      anchor,
      head,
      collapsed,
      anchorLine: anchorLineObj.number,
      anchorColumn: anchor - anchorLineObj.from + 1,
      headLine: headLineObj.number,
      headColumn: head - headLineObj.from + 1,
      anchorBlock: getBlockCategory(view, anchor),
      headBlock: getBlockCategory(view, head),
      anchorLineText: anchorLineObj.text,
      headLineText: headLineObj.text,
      anchorClientTop: anchorCoords ? anchorCoords.top : null,
      anchorClientBottom: anchorCoords ? anchorCoords.bottom : null,
      headClientTop: headCoords ? headCoords.top : null,
      headClientBottom: headCoords ? headCoords.bottom : null,
      viewTop: viewRect ? viewRect.top : null,
      viewBottom: viewRect ? viewRect.bottom : null,
      viewWidth: viewRect ? viewRect.width : null,
      viewHeight: viewRect ? viewRect.height : null,
      scrollTop: scroller ? scroller.scrollTop : null,
      scrollLeft: scroller ? scroller.scrollLeft : null,
      scrollHeight: scroller ? scroller.scrollHeight : null,
      clientHeight: scroller ? scroller.clientHeight : null,
      windowScrollY: typeof window !== 'undefined' ? window.scrollY : null,
      windowInnerHeight: typeof window !== 'undefined' ? window.innerHeight : null
    };
  } catch (e) {
    return null;
  }
}

export function setupNavigationDiagnostics(view) {
  if (!view || !view.dom) return;

  const dom = view.dom;
  const scroller = view.scrollDOM;
  const diagnosticMode = currentEditorMode;
  const doc = dom.ownerDocument;
  const win = doc.defaultView || window;
  let disposed = false;
  const listeners = [];
  const pendingTimers = new Set();
  const pendingFrames = new Set();
  const addListener = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
  };
  const scheduleTimeout = (callback, delay) => {
    let timerId;
    timerId = win.setTimeout(() => {
      pendingTimers.delete(timerId);
      if (!disposed) callback();
    }, delay);
    pendingTimers.add(timerId);
    return timerId;
  };
  const clearTrackedTimeout = (timerId) => {
    if (timerId == null) return;
    win.clearTimeout(timerId);
    pendingTimers.delete(timerId);
  };
  const scheduleFrame = (callback) => {
    if (typeof win.requestAnimationFrame !== 'function') {
      return scheduleTimeout(callback, 16);
    }
    let frameId;
    frameId = win.requestAnimationFrame(() => {
      pendingFrames.delete(frameId);
      if (!disposed) callback();
    });
    pendingFrames.add(frameId);
    return frameId;
  };
  const cleanupFullNavigationCapture = setupFullNavigationCapture(view);

  let activeArrowPress = null;
  let lastArrowEventTime = 0;
  let lastArrowPressId = null;

  const reportTrace = (record) => {
    if (disposed) return;
    const serialized = serializeNavigationTraceRecord(record);
    if (win.AndroidNative && typeof win.AndroidNative.reportNavigationTrace === 'function') {
      win.AndroidNative.reportNavigationTrace(serialized);
    }
  };
  const flushRenderLayoutMetrics = () => {
    if (typeof win.AndroidNative?.reportNavigationTrace !== 'function') return;
    const metrics = takeRenderLayoutMetrics(diagnosticMode);
    if (metrics) win.AndroidNative.reportNavigationTrace(JSON.stringify(metrics));
  };
  const handleDocumentVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') flushRenderLayoutMetrics();
  };
  addListener(doc, 'visibilitychange', handleDocumentVisibilityChange);
  addListener(win, 'pagehide', flushRenderLayoutMetrics);

  const addSampleToContainer = (container, sampleFactory) => {
    if (!container) return;
    const now = win.performance.now();
    if (now - (container.lastSampleTime || 0) < 50) return;
    const sampleObj = typeof sampleFactory === 'function'
      ? sampleFactory()
      : sampleFactory;
    if (!sampleObj) return;

    container.lastSampleTime = now;
    container.totalSampleCount = (container.totalSampleCount || 0) + 1;

    if (!container.scrollSamples) {
      container.scrollSamples = [];
    }

    if (container.scrollSamples.length < 12) {
      container.scrollSamples.push(sampleObj);
    } else {
      container.droppedSampleCount = (container.droppedSampleCount || 0) + 1;
      container.scrollSamples = [container.scrollSamples[0], ...container.scrollSamples.slice(2), sampleObj];
    }
  };

  const closeActiveArrowPress = (endedByBlur = false) => {
    if (!activeArrowPress) return;
    const press = activeArrowPress;
    activeArrowPress = null;

    const duration = Math.round(performance.now() - press.startTime);
    const afterSnap = getSnapshot(view);

    const record = {
      id: nextTraceId++,
      pressId: press.pressId,
      kind: 'arrow_press',
      source: 'arrow',
      direction: press.direction,
      duration,
      keydownCount: press.keydownCount,
      hadReportedRepeat: press.hadReportedRepeat,
      endedByBlur: Boolean(endedByBlur),
      before: press.beforeSnap,
      after: afterSnap,
      scrollSamples: press.scrollSamples,
      totalSampleCount: press.totalSampleCount,
      droppedSampleCount: press.droppedSampleCount
    };

    reportTrace(record);
    flushRenderLayoutMetrics();
  };

  // Capture phase keydown for ArrowUp / ArrowDown
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    const direction = (e.key === 'ArrowUp') ? 'up' : 'down';
    const reportedRepeat = Boolean(e.repeat);

    if (!activeArrowPress || activeArrowPress.direction !== direction) {
      if (activeArrowPress) {
        closeActiveArrowPress(false);
      }
      activeArrowPress = {
        pressId: nextTraceId++,
        direction,
        startTime: performance.now(),
        keydownCount: 0,
        hadReportedRepeat: false,
        beforeSnap: getSnapshot(view),
        scrollSamples: [],
        totalSampleCount: 0,
        droppedSampleCount: 0,
        lastSampleTime: 0
      };
    }

    activeArrowPress.keydownCount++;
    if (reportedRepeat) {
      activeArrowPress.hadReportedRepeat = true;
    }

    const press = activeArrowPress;
    const keydownIndex = press.keydownCount;
    const isEffectiveRepeat = reportedRepeat || keydownIndex > 1;
    const eventElapsedMs = Math.round(performance.now() - press.startTime);
    const eventTraceId = nextTraceId++;

    const beforeSnap = getSnapshot(view);
    lastArrowEventTime = performance.now();
    lastArrowPressId = press.pressId;

    scheduleFrame(() => {
      if (!view || !view.state) return;
      let afterSnap = getSnapshot(view);

      scheduleTimeout(() => {
        if (!view || !view.state) return;
        const afterSnap50 = getSnapshot(view);
        if (afterSnap50) afterSnap = afterSnap50;

        const deltaTop = (beforeSnap && afterSnap && beforeSnap.scrollTop !== null && afterSnap.scrollTop !== null)
          ? Math.round((afterSnap.scrollTop - beforeSnap.scrollTop) * 100) / 100
          : null;
        const deltaLeft = (beforeSnap && afterSnap && beforeSnap.scrollLeft !== null && afterSnap.scrollLeft !== null)
          ? Math.round((afterSnap.scrollLeft - beforeSnap.scrollLeft) * 100) / 100
          : null;

        const selChanged = (beforeSnap && afterSnap)
          ? (beforeSnap.anchor !== afterSnap.anchor || beforeSnap.head !== afterSnap.head)
          : false;

        const record = {
          id: eventTraceId,
          pressId: press.pressId,
          kind: 'arrow',
          source: 'arrow',
          direction,
          repeat: isEffectiveRepeat,
          reportedRepeat,
          keydownIndex,
          eventElapsedMs,
          scrollDeltaTop: deltaTop,
          scrollDeltaLeft: deltaLeft,
          selectionChanged: selChanged,
          before: beforeSnap,
          after: afterSnap
        };

        reportTrace(record);
      }, 50);
    });
  };
  addListener(dom, 'keydown', onKeyDown, true);

  // Keyup for ArrowUp / ArrowDown
  const onKeyUp = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const direction = (e.key === 'ArrowUp') ? 'up' : 'down';
    if (activeArrowPress && activeArrowPress.direction === direction) {
      closeActiveArrowPress(false);
    }
  };
  addListener(dom, 'keyup', onKeyUp, true);

  // Blur event closes active press
  const onWindowBlur = () => {
    if (activeArrowPress) {
      closeActiveArrowPress(true);
    }
  };
  addListener(win, 'blur', onWindowBlur);

  // Passive pointer gesture & scroll recorder
  let activePointerGesture = null;
  let unattributedScrollRecord = null;
  let unattributedScrollTimer = null;

  const getScrollTargetLabel = (el) => {
    if (!el) return 'page';
    if (el === scroller) return 'editor';
    if (el === document.body || el === document.documentElement || el === window) return 'page';
    if (scroller && scroller.contains(el)) return 'editor';
    return 'ancestor1';
  };

  const createSample = (targetLabel, px, py, source, pressId) => {
    try {
      const isPageTarget = (targetLabel === 'page');
      const targetEl = (targetLabel === 'editor' && scroller) ? scroller : null;
      const head = view.state.selection.main.head;
      const headLineObj = view.state.doc.lineAt(head);
      const headCoords = view.coordsAtPos(head);
      const viewRect = dom.getBoundingClientRect();
      const startTime = activePointerGesture ? activePointerGesture.startTime
        : (activeArrowPress ? activeArrowPress.startTime
        : (unattributedScrollRecord ? unattributedScrollRecord.startTime : performance.now()));

      return {
        elapsedMs: Math.round(performance.now() - startTime),
        pressId: pressId ?? null,
        source: source || 'unattributed',
        target: targetLabel,
        scrollTop: isPageTarget ? (typeof window !== 'undefined' ? window.scrollY : null) : (targetEl ? targetEl.scrollTop : (scroller ? scroller.scrollTop : null)),
        scrollLeft: targetEl ? targetEl.scrollLeft : (scroller ? scroller.scrollLeft : null),
        scrollHeight: scroller ? scroller.scrollHeight : null,
        clientHeight: scroller ? scroller.clientHeight : null,
        pointerX: px ?? null,
        pointerY: py ?? null,
        anchor: view.state.selection.main.anchor,
        head,
        headLine: headLineObj.number,
        headClientTop: headCoords ? headCoords.top : null,
        viewTop: viewRect ? viewRect.top : null,
        viewBottom: viewRect ? viewRect.bottom : null
      };
    } catch (e) {
      return null;
    }
  };

  const finalizeUnattributedScroll = () => {
    if (!unattributedScrollRecord) return;
    clearTrackedTimeout(unattributedScrollTimer);
    unattributedScrollTimer = null;

    const u = unattributedScrollRecord;
    unattributedScrollRecord = null;

    const duration = Math.round(performance.now() - u.startTime);
    const afterSnap = getSnapshot(view);
    const selChanged = (u.beforeSnap && afterSnap)
      ? (u.beforeSnap.anchor !== afterSnap.anchor || u.beforeSnap.head !== afterSnap.head)
      : false;

    const record = {
      id: u.id,
      kind: 'scroll',
      source: 'unattributed',
      direction: 'none',
      repeat: false,
      pointerType: 'unknown',
      duration,
      canceled: false,
      selectionChanged: selChanged,
      before: u.beforeSnap,
      after: afterSnap,
      scrollSamples: u.scrollSamples,
      totalSampleCount: u.totalSampleCount,
      droppedSampleCount: u.droppedSampleCount
    };

    reportTrace(record);
    flushRenderLayoutMetrics();
  };

  let pointerGestureTimer = null;

  let lastSelectionSnapshot = getSnapshot(view);
  let selectionChangeTimer = null;

  const onSelectionChange = () => {
    if (!view.hasFocus) return;

    clearTrackedTimeout(selectionChangeTimer);
    selectionChangeTimer = scheduleTimeout(() => {
      if (!view.hasFocus || !view.state) return;

      const after = getSnapshot(view);
      if (!after) return;
      const before = lastSelectionSnapshot;
      lastSelectionSnapshot = after;

      if (after.collapsed) return;
      if (before && before.anchor === after.anchor && before.head === after.head) return;

      const source = activePointerGesture
        ? 'pointer'
        : (activeArrowPress ? 'arrow' : 'unattributed');
      reportTrace({
        id: nextTraceId++,
        pressId: activeArrowPress
          ? activeArrowPress.pressId
          : (activePointerGesture ? activePointerGesture.id : null),
        kind: 'selection',
        source,
        direction: activeArrowPress ? activeArrowPress.direction : 'none',
        repeat: false,
        pointerType: activePointerGesture ? activePointerGesture.pointerType : 'unknown',
        duration: 0,
        selectionChanged: true,
        before,
        after
      });
    }, 80);
  };
  addListener(doc, 'selectionchange', onSelectionChange);

  const finalizePointerGesture = () => {
    if (!activePointerGesture) return;
    clearTrackedTimeout(pointerGestureTimer);
    pointerGestureTimer = null;

    const g = activePointerGesture;
    activePointerGesture = null;

    const duration = Math.round(performance.now() - g.startTime);
    const afterSnap = getSnapshot(view);
    const selChanged = (g.beforeSnap && afterSnap)
      ? (g.beforeSnap.anchor !== afterSnap.anchor || g.beforeSnap.head !== afterSnap.head)
      : false;

    let initialScrollTop = g.beforeSnap ? g.beforeSnap.scrollTop : 0;
    let finalScrollTop = afterSnap ? afterSnap.scrollTop : 0;
    let scrollMoved = (initialScrollTop !== null && finalScrollTop !== null)
      ? Math.abs(finalScrollTop - initialScrollTop) > 1
      : false;

    let isTap = (g.maxTravel <= 8) && !scrollMoved;
    const kind = isTap ? 'tap' : 'scroll';

    const record = {
      id: g.id,
      kind,
      source: 'pointer',
      direction: 'none',
      repeat: false,
      pointerType: g.pointerType,
      duration,
      pointerStartX: g.startX,
      pointerStartY: g.startY,
      pointerEndX: g.currentX,
      pointerEndY: g.currentY,
      maxTravel: g.maxTravel,
      canceled: g.canceled,
      selectionChanged: selChanged,
      before: g.beforeSnap,
      after: afterSnap,
      scrollSamples: g.scrollSamples,
      totalSampleCount: g.totalSampleCount,
      droppedSampleCount: g.droppedSampleCount
    };

    reportTrace(record);
    flushRenderLayoutMetrics();
  };

  const onPointerDown = (e) => {
    if (activePointerGesture) {
      finalizePointerGesture();
    }

    const traceId = nextTraceId++;
    const pType = e.pointerType || 'touch';
    const px = e.clientX;
    const py = e.clientY;
    const beforeSnap = getSnapshot(view);

    activePointerGesture = {
      id: traceId,
      pointerId: e.pointerId,
      pointerType: pType,
      startX: px,
      startY: py,
      currentX: px,
      currentY: py,
      maxTravel: 0,
      startTime: performance.now(),
      lastSampleTime: performance.now(),
      beforeSnap,
      scrollSamples: [],
      totalSampleCount: 0,
      droppedSampleCount: 0,
      canceled: false
    };

    clearTrackedTimeout(pointerGestureTimer);
    pointerGestureTimer = scheduleTimeout(() => finalizePointerGesture(), 300);
  };
  addListener(dom, 'pointerdown', onPointerDown, true);

  const onPointerMove = (e) => {
    if (!activePointerGesture || activePointerGesture.pointerId !== e.pointerId) return;
    activePointerGesture.currentX = e.clientX;
    activePointerGesture.currentY = e.clientY;
    const travel = Math.hypot(e.clientX - activePointerGesture.startX, e.clientY - activePointerGesture.startY);
    if (travel > activePointerGesture.maxTravel) {
      activePointerGesture.maxTravel = travel;
    }
    addSampleToContainer(
      activePointerGesture,
      () => createSample('editor', e.clientX, e.clientY, 'pointer', null)
    );

    clearTrackedTimeout(pointerGestureTimer);
    pointerGestureTimer = scheduleTimeout(() => finalizePointerGesture(), 300);
  };
  addListener(win, 'pointermove', onPointerMove, true);

  const onPointerUp = (e) => {
    if (!activePointerGesture || activePointerGesture.pointerId !== e.pointerId) return;
    activePointerGesture.currentX = e.clientX;
    activePointerGesture.currentY = e.clientY;
    const travel = Math.hypot(e.clientX - activePointerGesture.startX, e.clientY - activePointerGesture.startY);
    if (travel > activePointerGesture.maxTravel) {
      activePointerGesture.maxTravel = travel;
    }
    addSampleToContainer(
      activePointerGesture,
      () => createSample('editor', e.clientX, e.clientY, 'pointer', null)
    );
    scheduleTimeout(() => finalizePointerGesture(), 50);
  };
  addListener(win, 'pointerup', onPointerUp, true);

  const onPointerCancel = (e) => {
    if (!activePointerGesture || activePointerGesture.pointerId !== e.pointerId) return;
    activePointerGesture.canceled = true;
    scheduleTimeout(() => finalizePointerGesture(), 50);
  };
  addListener(win, 'pointercancel', onPointerCancel, true);

  // Passive scroll handler
  const onScroll = (e) => {
    const targetLabel = getScrollTargetLabel(e.target);
    const now = performance.now();

    // 1. Is there an active arrow press OR within 150 ms of recent arrow event?
    const inArrowWindow = (activeArrowPress != null) || (now - lastArrowEventTime < 150);
    if (inArrowWindow) {
      const targetContainer = activeArrowPress || {
        lastSampleTime: 0,
        scrollSamples: [],
        totalSampleCount: 0,
        droppedSampleCount: 0
      };
      addSampleToContainer(
        activeArrowPress || targetContainer,
        () => createSample(targetLabel, null, null, 'arrow', lastArrowPressId)
      );
      return;
    }

    // 2. Is there an active pointer gesture?
    if (activePointerGesture) {
      addSampleToContainer(
        activePointerGesture,
        () => createSample(
          targetLabel,
          activePointerGesture.currentX,
          activePointerGesture.currentY,
          'pointer',
          null
        )
      );
      clearTrackedTimeout(pointerGestureTimer);
      pointerGestureTimer = scheduleTimeout(() => finalizePointerGesture(), 300);
      return;
    }

    // 3. Otherwise unattributed scroll
    if (!unattributedScrollRecord || (now - unattributedScrollRecord.startTime >= 2000)) {
      if (unattributedScrollRecord) {
        finalizeUnattributedScroll();
      }
      unattributedScrollRecord = {
        id: nextTraceId++,
        startTime: now,
        lastSampleTime: 0,
        beforeSnap: getSnapshot(view),
        scrollSamples: [],
        totalSampleCount: 0,
        droppedSampleCount: 0
      };
    }

    addSampleToContainer(
      unattributedScrollRecord,
      () => createSample(targetLabel, null, null, 'unattributed', null)
    );

    clearTrackedTimeout(unattributedScrollTimer);
    unattributedScrollTimer = scheduleTimeout(() => finalizeUnattributedScroll(), 300);
    if (unattributedScrollTimer && typeof unattributedScrollTimer.unref === 'function') {
      unattributedScrollTimer.unref();
    }
  };

  if (scroller) addListener(scroller, 'scroll', onScroll, { passive: true });
  addListener(win, 'scroll', onScroll, { passive: true });

  return () => {
    if (disposed) return;
    flushRenderLayoutMetrics();
    disposed = true;
    for (const [target, type, handler, options] of listeners) {
      target.removeEventListener(type, handler, options);
    }
    listeners.length = 0;
    for (const timerId of pendingTimers) win.clearTimeout(timerId);
    pendingTimers.clear();
    for (const frameId of pendingFrames) win.cancelAnimationFrame?.(frameId);
    pendingFrames.clear();
    activeArrowPress = null;
    activePointerGesture = null;
    unattributedScrollRecord = null;
    cleanupFullNavigationCapture?.();
  };
}

window.addEventListener('DOMContentLoaded', () => {
  setupFloatingToggle();
  setupKeyboardShortcuts();
  setupLeftPanel();
  if (window.AndroidNative && typeof window.AndroidNative.onHostReady === 'function') {
    window.AndroidNative.onHostReady();
  } else {
    setEditorMode('wysiwyg');
  }
});

window.addEventListener('error', () => window.AndroidNative?.reportDiagnostic?.('js_error', 0));
window.addEventListener('unhandledrejection', () => window.AndroidNative?.reportDiagnostic?.('js_rejection', 0));
