import { parseWmdxResourceSyntax } from './wmdxResources.js';

function cellsInPipeRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let value = '';
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === '\\') {
      value += character;
      escaped = true;
    } else if (character === '|') {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function setDiagnostic(items, line, code, message, severity = 'warning') {
  items.push({ line, code, message, severity });
}

function containsWmdxOnlySyntax(line, dialect) {
  if (
    /^[ \t]*\.[1-6][ \t]+\S/.test(line) ||
    /^[ \t]*±[A-Za-z][\w-]*(?:[+-])?(?:[ \t]|$)/.test(line) ||
    /(?<![~\\])~(?!~)(\S(?:[^~\n]*?\S)?)~(?!~)/u.test(line) ||
    /(?<![\\^])\^([^\s^\n](?:[^^\n]*?[^\s^\n])?)\^(?!\^)/u.test(line) ||
    /==[₀₁₂]\S[^=\n]*==/u.test(line) ||
    /(?<![=\\])=(?:[₀₁₂])?\S[^=\n]*?=(?![=])/u.test(line) ||
    /(?<![_\\])_[₀₁₂₃]\S[^_\n]*?_/u.test(line) ||
    /^[ \t]*[A-Za-z]+[.)][ \t]+\S/.test(line) ||
    /^[ \t]*\[[ xX]\][ \t]+\S/.test(line)
  ) {
    return true;
  }
  if (/==[^=\n]+==/u.test(line) && dialect !== 'obsidian') return true;

  const resourcePattern = /!?(\[[^\]\n]*\])/g;
  let match;
  while ((match = resourcePattern.exec(line))) {
    if ((match[1].match(/\|/g) ?? []).length !== 3) continue;
    const syntax = `${match[0][0] === '!' ? '!' : ''}${match[1]}`;
    if (parseWmdxResourceSyntax(syntax)) return true;
  }
  return false;
}

export function lintMarkdown(source, { dialect = 'wmdx' } = {}) {
  const text = String(source ?? '');
  const selectedDialect = ['wmdx', 'commonmark', 'gfm', 'obsidian'].includes(dialect)
    ? dialect
    : 'wmdx';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const diagnostics = [];
  const codeLines = new Set();
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      codeLines.add(index);
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`).test(line)) {
        fence = null;
      }
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = { character: opening[1][0], length: opening[1].length };
      codeLines.add(index);
    }
  }
  if (fence) {
    setDiagnostic(
      diagnostics,
      lines.length,
      'unclosed-code-fence',
      'Code fence is not closed; following text may render as code.'
    );
  }

  const definitions = new Map();
  const references = [];
  const footnoteDefinitions = new Map();
  const footnoteReferences = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (codeLines.has(index)) continue;
    const line = lines[index];
    const number = index + 1;
    if (selectedDialect !== 'wmdx' &&
        containsWmdxOnlySyntax(line, selectedDialect)) {
      setDiagnostic(diagnostics, number, 'unsupported-wmdx-syntax',
        `This Wmdx-only syntax may not render in ${selectedDialect}.`);
    }
    if (selectedDialect === 'commonmark' &&
        (/^[ \t]*[-+*][ \t]+\[[ xX]\][ \t]+\S/.test(line) ||
         /~~[^~\n]+~~/.test(line) ||
         (index > 0 && /\|/.test(line) &&
          /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)))) {
      setDiagnostic(diagnostics, number, 'unsupported-gfm-syntax',
        'GFM task, strikethrough, or table syntax is not part of CommonMark.');
    }
    if (
      ['commonmark', 'gfm'].includes(selectedDialect) &&
      (/!?\[\[[^\]\n]+\]\]|%%|(?<![\\])\^\[[^\]\n]+\]/.test(line) ||
       (selectedDialect === 'commonmark' &&
        />[ \t]*\[![A-Za-z][\w-]*\]/.test(line)))
    ) {
      setDiagnostic(diagnostics, number, 'unsupported-obsidian-syntax',
        `This Obsidian-only syntax may not render in ${selectedDialect}.`);
    }
    const referenceDefinition = /^ {0,3}\[([^\]]+)\]:\s*(\S.*)?$/.exec(line);
    if (referenceDefinition) {
      const label = referenceDefinition[1].trim().toLowerCase();
      if (label.startsWith('^')) {
        const footnote = label.slice(1);
        if (footnoteDefinitions.has(footnote)) {
          setDiagnostic(diagnostics, number, 'duplicate-footnote-definition',
            `Footnote definition [^${footnote}] appears more than once.`);
        }
        footnoteDefinitions.set(footnote, number);
      } else {
        if (definitions.has(label)) {
          setDiagnostic(diagnostics, number, 'duplicate-reference-definition',
            `Reference definition [${referenceDefinition[1]}] appears more than once.`);
        }
        definitions.set(label, number);
      }
    }

    const footnotePattern = /(?<!\\)\[\^([^\]\s]+)\]/g;
    let footnoteMatch;
    while ((footnoteMatch = footnotePattern.exec(line))) {
      if (!/^ {0,3}\[\^/.test(line)) {
        footnoteReferences.push({ label: footnoteMatch[1].toLowerCase(), line: number });
      }
    }
    const referencePattern = /(?<!!)\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
    let referenceMatch;
    while ((referenceMatch = referencePattern.exec(line))) {
      const label = (referenceMatch[2] || referenceMatch[1]).trim().toLowerCase();
      if (!label.startsWith('^')) references.push({ label, line: number });
    }

    if (/\|/.test(line) && index + 1 < lines.length &&
        /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      const expected = cellsInPipeRow(line).length;
      for (let row = index + 2; row < lines.length && /\|/.test(lines[row]); row += 1) {
        if (codeLines.has(row) || !lines[row].trim()) break;
        const actual = cellsInPipeRow(lines[row]).length;
        if (actual !== expected) {
          setDiagnostic(diagnostics, row + 1, 'table-cell-count',
            `Table row has ${actual} cells; the header has ${expected}.`);
        }
      }
    }

    if (selectedDialect === 'obsidian' &&
        /!\[\[[^\]\n]*#[^\]\n]+\]\]/.test(line)) {
      setDiagnostic(diagnostics, number, 'unsupported-obsidian-transclusion',
        'Heading or block transclusion is not supported; this embed will not resolve as it does in Obsidian.');
    }

    const resourcePattern = /!?(\[[^\]\n]*\])/g;
    let resourceMatch;
    while ((resourceMatch = resourcePattern.exec(line))) {
      if ((resourceMatch[1].match(/\|/g) ?? []).length !== 3) continue;
      if (!parseWmdxResourceSyntax(`${resourceMatch[0][0] === '!' ? '!' : ''}${resourceMatch[1]}`)) {
        setDiagnostic(diagnostics, number, 'invalid-wmdx-resource',
          'Wmdx resource syntax needs a source, title, valid size, and valid alignment field.');
      }
    }

    if (/<(?:script|iframe|object|embed)\b/i.test(line)) {
      setDiagnostic(diagnostics, number, 'active-html',
        'Active HTML is not imported or executed by W.mdx; convert it to a supported link or attachment.');
    } else if (/\son\w+\s*=/i.test(line)) {
      setDiagnostic(diagnostics, number, 'html-event-attribute',
        'HTML event-handler attributes are not supported and will not run.');
    }
  }

  for (const reference of references) {
    if (!definitions.has(reference.label)) {
      setDiagnostic(diagnostics, reference.line, 'unresolved-reference-link',
        `Reference link [${reference.label}] has no matching definition.`);
    }
  }
  for (const reference of footnoteReferences) {
    if (!footnoteDefinitions.has(reference.label)) {
      setDiagnostic(diagnostics, reference.line, 'unresolved-footnote',
        `Footnote reference [^${reference.label}] has no matching definition.`);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (codeLines.has(index)) continue;
    const match = /^([ \t]*)±([A-Za-z][A-Za-z0-9_-]*)([+-]?)(?:[ \t]+.*)?$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    let bodyLine = index + 1;
    while (bodyLine < lines.length && !lines[bodyLine].trim()) bodyLine += 1;
    if (bodyLine >= lines.length ||
        /^[ \t]*/.exec(lines[bodyLine])[0].length <= indent) {
      setDiagnostic(diagnostics, index + 1, 'empty-callout-body',
        `Callout “${match[2]}” has no indented body content.`);
    }
  }

  return diagnostics.sort((left, right) =>
    left.line - right.line || left.code.localeCompare(right.code)
  );
}
