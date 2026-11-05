import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

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

function getPairedSuperscriptRanges(text) {
  const ranges = [];
  for (let from = 0; from < text.length; from++) {
    if (text[from] !== '^' || isEscaped(text, from)) continue;
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
  isTablePosition = () => false
) {
  text = String(text ?? '');
  if (!text.includes('^')) return { definitions: [], references: [] };

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
    const match = /^\s*\[\^([^\]\s]+)\]:\s?(.*)$/.exec(firstLine.text);
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

    const nativeMatch = /^\^ (.*)$/.exec(firstLine.text);
    if (!nativeMatch ||
        isCodePosition(firstLine.from) ||
        isTablePosition(firstLine.from)) {
      continue;
    }

    nativeDefinitions.push({
      body: nativeMatch[1],
      from: firstLine.from,
      to: firstLine.to,
      syntax: 'wmdx'
    });
  }

  nativeDefinitions.forEach((definition, index) => {
    const label = String(index + 1);
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

  const references = [];
  const pairedSuperscripts = getPairedSuperscriptRanges(text);
  const referencePattern = /\[\^([^\]\s]+)\]/g;
  let referenceMatch;
  while ((referenceMatch = referencePattern.exec(text)) !== null) {
    const from = referenceMatch.index;
    const to = from + referenceMatch[0].length;
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
  }

  let nextAutomaticNumber = 1;
  for (let position = 0; position < text.length;) {
    const from = text.indexOf('^', position);
    if (from < 0) break;
    position = from + 1;

    if (isEscaped(text, from) ||
        definitionRanges.some(definition => from >= definition.from && from < definition.to) ||
        pairedSuperscripts.some(range => from >= range.from && from < range.to) ||
        isCodePosition(from) ||
        isTablePosition(from) ||
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
      references.push({
        label,
        normalizedLabel: label.toLowerCase(),
        from,
        to,
        syntax: 'wmdx'
      });
      continue;
    }

    const assignedLabel = String(nextAutomaticNumber++);
    references.push({
      label: assignedLabel,
      normalizedLabel: assignedLabel,
      from,
      to,
      syntax: 'wmdx'
    });
  }

  definitions.sort((left, right) => left.from - right.from);
  references.sort((left, right) => left.from - right.from);
  return { definitions, references };
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
        position => isInsideTable(state, position)
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
    to: changes.mapPos(range.to, 1)
  });
  const footnotes = {
    definitions: currentFootnotes.definitions.map(mapRange),
    references: currentFootnotes.references.map(mapRange)
  };
  return buildFootnoteDecorationsFromParsed(state, footnotes, options);
}
