import { syntaxTree } from '@codemirror/language';
import { escapeMarkdownField } from './markdownEscaping.js';

import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { normalizeFootnoteSyntaxSettings } from './footnoteSyntax.mjs';

const CODE_NODE_NAMES = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
const FOOTNOTE_STRUCTURE_CHARS = /[\[\]^:`~\r\n]/;

function isInsideCode(state, position) {
  const probe = Math.max(0, Math.min(position, state.doc.length));
  for (let node = syntaxTree(state).resolveInner(probe, 1); node; node = node.parent) {
    if (CODE_NODE_NAMES.has(node.name)) return true;
  }
  return false;
}

function isInsideFencedCode(state, position) {
  const probe = Math.max(0, Math.min(position, state.doc.length));
  for (let node = syntaxTree(state).resolveInner(probe, 1); node; node = node.parent) {
    if (node.name === 'FencedCode') return true;
  }
  return false;
}

function isInsideTable(state, position) {
  const probe = Math.max(0, Math.min(position, state.doc.length));
  for (let node = syntaxTree(state).resolveInner(probe, 1); node; node = node.parent) {
    if (node.name === 'Table') return true;
  }
  return false;
}

function isEscaped(text, position) {
  let backslashes = 0;
  for (let index = position - 1; index >= 0 && text[index] === '\\'; index--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function isPositionInRanges(position, ranges) {
  return ranges.some(range => position >= range.from && position < range.to);
}

function getObsidianInlineFootnotes(
  text,
  isCodePosition,
  isTablePosition,
  excludedRanges
) {
  const matches = [];
  for (let from = 0; from < text.length - 2; from++) {
    if (
      text[from] !== '^' ||
      text[from + 1] !== '[' ||
      isEscaped(text, from) ||
      isPositionInRanges(from, excludedRanges) ||
      isCodePosition(from) ||
      isTablePosition(from)
    ) {
      continue;
    }

    let depth = 1;
    let close = -1;
    for (let index = from + 2; index < text.length && text[index] !== '\n'; index++) {
      if (text[index] === '\\') {
        index++;
        continue;
      }
      if (text[index] === '[') depth++;
      else if (text[index] === ']' && --depth === 0) {
        close = index;
        break;
      }
    }
    if (close < 0 || !text.slice(from + 2, close).trim()) continue;

    matches.push({
      from,
      to: close + 1,
      body: text.slice(from + 2, close).replace(/\\([\\[\]])/g, '$1')
    });
    from = close;
  }
  return matches;
}

function getPairedSuperscriptRanges(text, excludedRanges = []) {
  const ranges = [];
  for (let from = 0; from < text.length; from++) {
    if (
      text[from] !== '^' ||
      isEscaped(text, from) ||
      isPositionInRanges(from, excludedRanges)
    ) continue;
    const first = text[from + 1] || '';
    if (!first || /[\s.,;:!?)}\]]/.test(first)) continue;

    if (/\d/.test(first)) {
      const numericPair = /^\^(\d+)\^/.exec(text.slice(from));
      if (numericPair && !isEscaped(text, from + numericPair[0].length - 1)) {
        ranges.push({ from, to: from + numericPair[0].length });
        from += numericPair[0].length - 1;
      }
      continue;
    }

    for (let to = from + 1; to < text.length && text[to] !== '\n'; to++) {
      if (isPositionInRanges(to, excludedRanges)) {
        to = excludedRanges.find(range => to >= range.from && to < range.to).to - 1;
        continue;
      }
      if (text[to] !== '^' || isEscaped(text, to)) continue;
      ranges.push({ from, to: to + 1 });
      from = to;
      break;
    }
  }
  return ranges;
}

export function parseFootnotes(
  text,
  isCodePosition = () => false,
  isFencedCodePosition = () => false,
  isTablePosition = () => false,
  options = {}
) {
  text = String(text ?? '');
  if (!text.includes('^')) return { definitions: [], references: [] };
  const syntaxSettings = normalizeFootnoteSyntaxSettings(
    options.syntaxSettings ?? {}
  );
  if (!syntaxSettings.enabled) return { definitions: [], references: [] };

  const lines = [];
  let offset = 0;
  for (const rawLine of text.split('\n')) {
    const lineText = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    lines.push({ from: offset, to: offset + rawLine.length, text: lineText });
    offset += rawLine.length + 1;
  }

  const definitions = [];
  const definitionsByLabel = new Map();
  const definitionRanges = [];
  const nativeDefinitions = [];
  for (let index = 0; index < lines.length; index++) {
    const firstLine = lines[index];
    const match = syntaxSettings.markdown
      ? /^\s*\[\^([^\]\s]+)\]:\s?(.*)$/.exec(firstLine.text)
      : null;
    if (match && !isCodePosition(firstLine.from + match[0].indexOf('[^')) &&
        !isTablePosition(firstLine.from + match[0].indexOf('[^'))) {
      const bodyParts = [match[2]];
      let lastLine = firstLine;
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1];
        const continuation = /^ {4,}(.*)$/.exec(nextLine.text);
        if (!continuation || isFencedCodePosition(nextLine.from)) break;
        bodyParts.push(continuation[1]);
        lastLine = nextLine;
        index++;
      }

      const label = match[1];
      const definition = {
        label,
        normalizedLabel: label.toLowerCase(),
        body: bodyParts.join('\n'),
        from: firstLine.from,
        to: lastLine.to,
        syntax: 'markdown'
      };
      definitions.push(definition);
      definitionRanges.push(definition);
      if (!definitionsByLabel.has(definition.normalizedLabel)) {
        definitionsByLabel.set(definition.normalizedLabel, definition);
      }
      continue;
    }

    const nativeMatch = syntaxSettings.wmdx
      ? /^\^ (.*)$/.exec(firstLine.text)
      : null;
    if (!nativeMatch ||
        isCodePosition(firstLine.from) ||
        isTablePosition(firstLine.from)) {
      continue;
    }

    const bodyParts = [nativeMatch[1]];
    let lastLine = firstLine;
    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      const continuation = /^ {2,}(.*)$/.exec(nextLine.text);
      if (
        !continuation ||
        isCodePosition(nextLine.from) ||
        isTablePosition(nextLine.from)
      ) {
        break;
      }
      bodyParts.push(continuation[1]);
      lastLine = nextLine;
      index++;
    }

    nativeDefinitions.push({
      body: bodyParts.join('\n'),
      from: firstLine.from,
      to: lastLine.to,
      syntax: 'wmdx'
    });
  }

  const inlineFootnotes = syntaxSettings.obsidian_inline
    ? getObsidianInlineFootnotes(
        text,
        isCodePosition,
        isTablePosition,
        [...definitionRanges, ...nativeDefinitions]
      )
    : [];

  const markdownNumericLabels = definitions
    .map(definition => Number(definition.label))
    .filter(Number.isInteger)
    .filter(label => label > 0);
  let nextNativeDefinitionNumber = markdownNumericLabels.length
    ? Math.max(...markdownNumericLabels) + 1
    : 1;
  nativeDefinitions.forEach(definition => {
    while (definitionsByLabel.has(String(nextNativeDefinitionNumber))) {
      nextNativeDefinitionNumber++;
    }
    const label = String(nextNativeDefinitionNumber++);
    const numberedDefinition = {
      ...definition,
      label,
      normalizedLabel: label
    };
    definitions.push(numberedDefinition);
    definitionRanges.push(numberedDefinition);
    if (!definitionsByLabel.has(label)) {
      definitionsByLabel.set(label, numberedDefinition);
    }
  });

  const usedNumberLabels = new Set(
    [...definitionsByLabel.keys()].filter(label => /^\d+$/.test(label))
  );
  let nextInlineNumber = Math.max(
    0,
    ...[...usedNumberLabels].map(Number)
  ) + 1;
  for (const inline of inlineFootnotes) {
    while (usedNumberLabels.has(String(nextInlineNumber))) nextInlineNumber++;
    const label = String(nextInlineNumber++);
    usedNumberLabels.add(label);
    const definition = {
      label,
      normalizedLabel: label,
      body: inline.body,
      from: inline.from,
      to: inline.to,
      renderAt: text.length,
      syntax: 'obsidian_inline'
    };
    definitions.push(definition);
    definitionsByLabel.set(label, definition);
    definitionRanges.push(definition);
  }

  const references = [];
  const markdownReferencedNumberLabels = new Set();
  const pairedSuperscripts = getPairedSuperscriptRanges(text, inlineFootnotes);
  const referencePattern = /\[\^([^\]\s]+)\]/g;
  let referenceMatch;
  while ((referenceMatch = referencePattern.exec(text)) !== null) {
    const from = referenceMatch.index;
    const to = from + referenceMatch[0].length;
    if (isPositionInRanges(from, inlineFootnotes)) continue;
    if (definitionRanges.some(definition => from >= definition.from && from < definition.to)) continue;
    if (!definitionsByLabel.has(referenceMatch[1].toLowerCase())) continue;
    if (isCodePosition(from + 2)) continue;
    if (isTablePosition(from + 2)) continue;
    references.push({
      label: referenceMatch[1],
      normalizedLabel: referenceMatch[1].toLowerCase(),
      from,
      to,
      syntax: 'markdown'
    });
    if (/^\d+$/.test(referenceMatch[1])) {
      markdownReferencedNumberLabels.add(referenceMatch[1]);
    }
  }
  for (const inline of inlineFootnotes) {
    const definition = definitions.find(
      item => item.syntax === 'obsidian_inline' && item.from === inline.from
    );
    if (!definition) continue;
    references.push({
      label: definition.label,
      normalizedLabel: definition.normalizedLabel,
      from: inline.from,
      to: inline.to,
      syntax: 'obsidian_inline'
    });
  }

  const nativeReferenceCandidates = [];
  for (let position = 0; syntaxSettings.wmdx && position < text.length;) {
    const from = text.indexOf('^', position);
    if (from < 0) break;
    position = from + 1;

    if (isEscaped(text, from) ||
        definitionRanges.some(definition => from >= definition.from && from < definition.to) ||
        pairedSuperscripts.some(range => from >= range.from && from < range.to) ||
        isCodePosition(from) ||
        isTablePosition(from) ||
        isPositionInRanges(from, inlineFootnotes) ||
        text[from - 1] === '[') {
      continue;
    }

    const numeric = /^\^(\d+)/.exec(text.slice(from));
    const label = numeric?.[1];
    const to = from + (numeric ? numeric[0].length : 1);
    const after = text[to] || '';
    if (after === '^' ||
        (after && !/[\s.,;:!?)}\]]/.test(after))) {
      continue;
    }
    if (/\s/.test(text[from - 1] || '')) continue;

    if (label) {
      if (!definitionsByLabel.has(label.toLowerCase())) continue;
    }
    nativeReferenceCandidates.push({ from, to, label });
  }

  const explicitNativeLabels = new Set(
    nativeReferenceCandidates
      .map(reference => reference.label)
      .filter(Boolean)
  );
  const inlineLabels = inlineFootnotes
    .map(inline => definitions.find(
      item => item.syntax === 'obsidian_inline' && item.from === inline.from
    )?.label)
    .filter(Boolean);
  const explicitlyReferencedLabels = new Set([
    ...markdownReferencedNumberLabels,
    ...explicitNativeLabels,
    ...inlineLabels
  ]);
  const definedNumberLabels = [...definitionsByLabel.keys()]
    .filter(label => /^\d+$/.test(label))
    .sort((left, right) => Number(left) - Number(right));
  const unreferencedDefinitionLabels = definedNumberLabels
    .filter(label => !explicitlyReferencedLabels.has(label));
  const automaticCandidates = nativeReferenceCandidates
    .filter(reference => !reference.label);
  // Toolbar references are inserted at the caret while their definitions are
  // appended, so match them to unused definitions before falling back to
  // source-order numbering (where explicit refs may simply be reuses).
  const assignFromUnreferencedDefinitions =
    automaticCandidates.length <= unreferencedDefinitionLabels.length;
  let unreferencedDefinitionIndex = 0;
  const sequentiallyUsedLabels = new Set(inlineLabels);
  let nextAutomaticNumber = 1;
  const nativeAutomaticReferencePositions = new Set();
  for (const { from, to, label } of nativeReferenceCandidates) {
    if (label) {
      references.push({
        label,
        normalizedLabel: label.toLowerCase(),
        from,
        to,
        syntax: 'wmdx'
      });
      sequentiallyUsedLabels.add(label);
    } else {
      let assignedLabel;
      if (assignFromUnreferencedDefinitions) {
        assignedLabel =
          unreferencedDefinitionLabels[unreferencedDefinitionIndex++];
      } else {
        while (sequentiallyUsedLabels.has(String(nextAutomaticNumber))) {
          nextAutomaticNumber++;
        }
        assignedLabel = String(nextAutomaticNumber++);
        sequentiallyUsedLabels.add(assignedLabel);
      }
      if (!assignedLabel) continue;
      references.push({
        label: assignedLabel,
        normalizedLabel: assignedLabel,
        from,
        to,
        syntax: 'wmdx'
      });
      nativeAutomaticReferencePositions.add(from);
    }
  }

  if (inlineFootnotes.length) {
    const explicitlyReferencedLabels = new Set([
      ...markdownReferencedNumberLabels,
      ...explicitNativeLabels
    ]);
    const hasPinnedGeneratedDefinition = definitions.some(
      definition =>
        (definition.syntax === 'wmdx' ||
          definition.syntax === 'obsidian_inline') &&
        explicitlyReferencedLabels.has(definition.normalizedLabel)
    );
    if (!hasPinnedGeneratedDefinition) {
      const generatedItems = [];
      const matchedDefinitions = new Set();
      for (const reference of references) {
        if (
          reference.syntax === 'wmdx' &&
          nativeAutomaticReferencePositions.has(reference.from)
        ) {
          const definition = definitions.find(
            item =>
              item.syntax === 'wmdx' &&
              item.normalizedLabel === reference.normalizedLabel
          );
          if (definition) matchedDefinitions.add(definition);
          generatedItems.push({
            from: reference.from,
            reference,
            definition
          });
        } else if (reference.syntax === 'obsidian_inline') {
          const definition = definitions.find(
            item =>
              item.syntax === 'obsidian_inline' &&
              item.from === reference.from
          );
          if (definition) matchedDefinitions.add(definition);
          generatedItems.push({
            from: reference.from,
            reference,
            definition
          });
        }
      }
      for (const definition of definitions) {
        if (
          definition.syntax === 'wmdx' &&
          !matchedDefinitions.has(definition)
        ) {
          generatedItems.push({ from: Number.MAX_SAFE_INTEGER, definition });
        }
      }
      generatedItems.sort((left, right) => left.from - right.from);

      for (const item of generatedItems) {
        const oldLabel =
          item.definition?.normalizedLabel ??
          item.reference?.normalizedLabel;
        if (oldLabel) definitionsByLabel.delete(oldLabel);
      }
      const markdownMaxNumber = Math.max(0, ...markdownNumericLabels);
      let nextGeneratedNumber = markdownMaxNumber + 1;
      for (const item of generatedItems) {
        while (definitionsByLabel.has(String(nextGeneratedNumber))) {
          nextGeneratedNumber++;
        }
        const label = String(nextGeneratedNumber++);
        if (item.definition) {
          item.definition.label = label;
          item.definition.normalizedLabel = label;
          definitionsByLabel.set(label, item.definition);
        }
        if (item.reference) {
          item.reference.label = label;
          item.reference.normalizedLabel = label;
        }
      }
    }
  }

  definitions.sort((left, right) => left.from - right.from);
  references.sort((left, right) => left.from - right.from);
  return { definitions, references };
}

export function parseFootnotesForState(state, options = {}) {
  if (!state?.doc) return { definitions: [], references: [] };
  return parseFootnotes(
    state.doc.toString(),
    position => isInsideCode(state, position),
    position => isInsideFencedCode(state, position),
    position => isInsideTable(state, position),
    options
  );
}

export function nextFootnoteLabel(text) {
  let highest = 0;
  for (const match of String(text ?? '').matchAll(/\[\^(\d+)\]/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return String(highest + 1);
}

export function formatFootnoteDefinition(label, body) {
  const normalizedBody = String(body ?? '').replace(/\r\n?/g, '\n').trim();
  const lines = normalizedBody.split('\n');
  return `[^${label}]: ${lines[0]}${lines.slice(1).map(line => `\n    ${line}`).join('')}`;
}

export function formatWmdxFootnoteDefinition(body) {
  const normalizedBody = String(body ?? '').replace(/\r\n?/g, '\n').trim();
  const lines = normalizedBody.split('\n');
  return `^ ${lines[0]}${lines.slice(1).map(line => `\n  ${line}`).join('')}`;
}

export function formatObsidianInlineFootnote(body) {
  const normalizedBody = String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\s*\n\s*/g, ' ');
  const escapedBody = escapeMarkdownField(normalizedBody, {
    escapeCharacters: ']'
  });
  return `^[${escapedBody}]`;
}

class FootnoteReferenceWidget extends WidgetType {
  constructor(label, normalizedLabel, targetPosition, onNavigate) {
    super();
    this.label = label;
    this.normalizedLabel = normalizedLabel;
    this.targetPosition = targetPosition;
    this.onNavigate = onNavigate;
  }

  eq(other) {
    return other instanceof FootnoteReferenceWidget &&
      other.label === this.label &&
      other.normalizedLabel === this.normalizedLabel &&
      other.targetPosition === this.targetPosition;
  }

  toDOM(view) {
    const reference = document.createElement('sup');
    reference.className = 'cm-footnote-reference';
    reference.textContent = this.label;
    reference.dataset.footnoteLabel = this.normalizedLabel;
    reference.tabIndex = 0;
    reference.setAttribute('role', 'button');
    reference.setAttribute('aria-label', `Go to footnote ${this.label}`);
    reference.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.onNavigate?.(view, this.targetPosition);
    });
    return reference;
  }

  ignoreEvent(event) {
    return event.type === 'click' || event.type === 'mousedown';
  }
}

class FootnoteDefinitionWidget extends WidgetType {
  constructor(definition, references, onEdit, onNavigate) {
    super();
    this.definition = definition;
    this.references = references;
    this.onEdit = onEdit;
    this.onNavigate = onNavigate;
  }

  eq(other) {
    return other instanceof FootnoteDefinitionWidget &&
      other.definition.label === this.definition.label &&
      other.definition.body === this.definition.body &&
      other.definition.from === this.definition.from &&
      other.definition.to === this.definition.to &&
      other.references.length === this.references.length &&
      other.references.every((reference, index) =>
        reference.from === this.references[index].from
      );
  }

  toDOM(view) {
    const section = document.createElement('div');
    section.className = 'cm-footnote-definition';

    const number = document.createElement('span');
    number.className = 'cm-footnote-number';
    number.textContent = `${this.definition.label}.`;
    section.appendChild(number);

    const text = document.createElement('span');
    text.className = 'cm-footnote-text';
    text.textContent = this.definition.body;
    text.tabIndex = 0;
    text.setAttribute('role', 'button');
    text.setAttribute('aria-label', `Edit footnote ${this.definition.label}`);
    text.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.onEdit?.(this.definition);
    });
    text.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      this.onEdit?.(this.definition);
    });
    section.appendChild(text);

    this.references.forEach((reference, index) => {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'cm-footnote-backlink';
      back.textContent = this.references.length > 1 ? `↩${index + 1}` : '↩';
      back.setAttribute(
        'aria-label',
        `Return to reference ${index + 1} for footnote ${this.definition.label}`
      );
      back.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.onNavigate?.(view, reference.from);
      });
      section.appendChild(back);
    });
    return section;
  }

  ignoreEvent(event) {
    return event.type === 'click' || event.type === 'mousedown';
  }
}

class FootnoteInlineDefinitionsWidget extends WidgetType {
  constructor(definitions, referencesByLabel, onEdit, onNavigate) {
    super();
    this.definitions = definitions;
    this.referencesByLabel = referencesByLabel;
    this.onEdit = onEdit;
    this.onNavigate = onNavigate;
  }

  eq(other) {
    return other instanceof FootnoteInlineDefinitionsWidget &&
      JSON.stringify(this.definitions) === JSON.stringify(other.definitions) &&
      this.definitions.every(definition => {
        const current = this.referencesByLabel.get(definition.normalizedLabel) ?? [];
        const next = other.referencesByLabel.get(definition.normalizedLabel) ?? [];
        return current.length === next.length &&
          current.every((reference, index) => reference.from === next[index].from);
      });
  }

  toDOM(view) {
    const group = document.createElement('div');
    group.className = 'cm-footnote-inline-definitions';
    for (const definition of this.definitions) {
      const widget = new FootnoteDefinitionWidget(
        definition,
        this.referencesByLabel.get(definition.normalizedLabel) ?? [],
        this.onEdit,
        this.onNavigate
      );
      group.appendChild(widget.toDOM(view));
    }
    return group;
  }

  ignoreEvent(event) {
    return event.type === 'click' || event.type === 'mousedown';
  }
}

function buildFootnoteDecorationsFromParsed(
  state,
  footnotes,
  { mode, onEdit, onNavigate } = {}
) {
  if (mode === 'source') {
    return {
      decorations: Decoration.none,
      hiddenSyntaxRanges: Decoration.none,
      hasFootnotes: false,
      footnotes: { definitions: [], references: [] }
    };
  }

  const hasFootnotes = footnotes.definitions.length > 0 || footnotes.references.length > 0;
  if (!hasFootnotes) {
    return {
      decorations: Decoration.none,
      hiddenSyntaxRanges: Decoration.none,
      hasFootnotes: false,
      footnotes
    };
  }

  const activeSelection = state.selection.main;
  const nativeReferences = new Set(
    footnotes.references.filter(reference => reference.syntax === 'wmdx')
  );
  const shouldReveal = range => {
    const cursorInside = activeSelection.empty &&
      activeSelection.head >= range.from &&
      activeSelection.head <= range.to;
    const selectionTouches = !activeSelection.empty &&
      activeSelection.from < range.to &&
      activeSelection.to > range.from;

    return (
      (mode === 'live_preview' && (cursorInside || selectionTouches)) ||
      (mode !== 'source' && nativeReferences.has(range) && cursorInside)
    );
  };
  const decorations = [];
  const hiddenSyntaxRanges = [];
  const referencesByLabel = new Map();
  for (const reference of footnotes.references) {
    const references = referencesByLabel.get(reference.normalizedLabel) ?? [];
    references.push(reference);
    referencesByLabel.set(reference.normalizedLabel, references);
  }

  for (const reference of footnotes.references) {
    if (shouldReveal(reference)) continue;
    const target = footnotes.definitions.find(
      definition => definition.normalizedLabel === reference.normalizedLabel
    );
    decorations.push(
      Decoration.replace({
        widget: new FootnoteReferenceWidget(
          reference.label,
          reference.normalizedLabel,
          target?.from,
          onNavigate
        )
      }).range(reference.from, reference.to)
    );
    hiddenSyntaxRanges.push(Decoration.replace({}).range(reference.from, reference.to));
  }

  for (const definition of footnotes.definitions) {
    if (Number.isInteger(definition.renderAt)) continue;
    if (shouldReveal(definition)) continue;
    decorations.push(
      Decoration.widget({
        widget: new FootnoteDefinitionWidget(
          definition,
          referencesByLabel.get(definition.normalizedLabel) ?? [],
          onEdit,
          onNavigate
        ),
        block: true,
        side: -1
      }).range(definition.from)
    );
    decorations.push(
      Decoration.replace({ block: true }).range(definition.from, definition.to)
    );
    hiddenSyntaxRanges.push(
      Decoration.replace({ block: true }).range(definition.from, definition.to)
    );
  }

  const inlineDefinitions = footnotes.definitions.filter(
    definition => Number.isInteger(definition.renderAt)
  );
  if (inlineDefinitions.length) {
    const renderAt = Math.max(...inlineDefinitions.map(definition => definition.renderAt));
    decorations.push(
      Decoration.widget({
        widget: new FootnoteInlineDefinitionsWidget(
          inlineDefinitions,
          referencesByLabel,
          onEdit,
          onNavigate
        ),
        block: true,
        side: 1
      }).range(renderAt)
    );
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  hiddenSyntaxRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    decorations: Decoration.set(decorations, true),
    hiddenSyntaxRanges: hiddenSyntaxRanges.length
      ? Decoration.set(hiddenSyntaxRanges, true)
      : Decoration.none,
    hasFootnotes: true,
    footnotes
  };
}

export function buildFootnoteDecorations(state, options = {}) {
  const footnotes = options.mode === 'source'
    ? { definitions: [], references: [] }
    : parseFootnotes(
        state.doc.toString(),
        position => isInsideCode(state, position),
        position => isInsideFencedCode(state, position),
        position => isInsideTable(state, position),
        { syntaxSettings: options.syntaxSettings }
      );
  return buildFootnoteDecorationsFromParsed(state, footnotes, options);
}

export function footnoteEditRequiresReparse(current, transaction, mode) {
  if (!transaction.docChanged || mode === 'source') return false;

  const footnotes = current?.footnotes || { definitions: [], references: [] };
  const noteRanges = [...footnotes.definitions, ...footnotes.references];
  let requiresReparse = false;

  transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (requiresReparse) return;

    const oldText = transaction.startState.doc.sliceString(fromA, toA);
    const newText = transaction.state.doc.sliceString(fromB, toB);
    if (FOOTNOTE_STRUCTURE_CHARS.test(oldText + newText)) {
      requiresReparse = true;
      return;
    }

    if (noteRanges.some(range => fromA <= range.to && toA >= range.from)) {
      requiresReparse = true;
    }
  });

  return requiresReparse;
}

export function updateFootnoteDecorationsFromCached(state, current, changes, options = {}) {
  const currentFootnotes = current?.footnotes || { definitions: [], references: [] };
  const mapRange = range => ({
    ...range,
    from: changes.mapPos(range.from, -1),
    to: changes.mapPos(range.to, 1),
    ...(Number.isInteger(range.renderAt)
      ? { renderAt: changes.mapPos(range.renderAt, 1) }
      : {})
  });
  const footnotes = {
    definitions: currentFootnotes.definitions.map(mapRange),
    references: currentFootnotes.references.map(mapRange)
  };
  return buildFootnoteDecorationsFromParsed(state, footnotes, options);
}
