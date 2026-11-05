import { parseWmdxResourceSyntax } from './wmdxResources.js';

export function isEscapedPipe(text, index) {
  if (text[index] !== '|') return false;
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function resourceTokenEnd(text, start) {
  const isEmbed = text[start] === '!' && text[start + 1] === '[';
  let precedingBackslashes = 0;
  for (let index = start - 1; index >= 0 && text[index] === '\\'; index -= 1) {
    precedingBackslashes += 1;
  }
  if (
    (!isEmbed && text[start] !== '[') ||
    precedingBackslashes % 2 === 1 ||
    (start > 0 && text[start - 1] === '!')
  ) {
    return -1;
  }

  let backslashes = 0;
  for (let index = start + (isEmbed ? 2 : 1); index < text.length; index += 1) {
    const character = text[index];
    if (character === ']' && backslashes % 2 === 0) {
      const end = index + 1;
      return parseWmdxResourceSyntax(text.slice(start, end)) ? index : -1;
    }
    if (character === '\\') backslashes += 1;
    else backslashes = 0;
  }
  return -1;
}

export function getUnescapedPipeOffsets(text) {
  const offsets = [];
  for (let i = 0; i < text.length; i++) {
    const resourceEnd = resourceTokenEnd(text, i);
    if (resourceEnd >= 0) {
      i = resourceEnd;
      continue;
    }
    if (text[i] === '|' && !isEscapedPipe(text, i)) offsets.push(i);
  }
  return offsets;
}

export function hasTrailingUnescapedPipe(text, pipeOffsets = getUnescapedPipeOffsets(text)) {
  const trailingWhitespaceOffset = text.search(/\s*$/);
  return pipeOffsets.length > 0 &&
    pipeOffsets[pipeOffsets.length - 1] === trailingWhitespaceOffset - 1;
}

export function parsePipeRow(lineText) {
  const pipeOffsets = getUnescapedPipeOffsets(lineText);
  if (pipeOffsets.length === 0) {
    const cell = lineText.trim();
    return cell ? [cell] : null;
  }

  const firstContentOffset = lineText.search(/\S|$/);
  const hasLeadingPipe = pipeOffsets[0] === firstContentOffset;
  const hasTrailingPipe = hasTrailingUnescapedPipe(lineText, pipeOffsets);

  const firstCellStart = hasLeadingPipe ? pipeOffsets[0] + 1 : 0;
  const lastCellEnd = hasTrailingPipe ? pipeOffsets[pipeOffsets.length - 1] : lineText.length;

  const internalPipes = pipeOffsets.filter((offset, i) =>
    !(hasLeadingPipe && i === 0) &&
    !(hasTrailingPipe && i === pipeOffsets.length - 1)
  );

  const cells = [];
  let cellStart = firstCellStart;
  for (const pipe of internalPipes) {
    cells.push(lineText.slice(cellStart, pipe).trim());
    cellStart = pipe + 1;
  }
  if (lastCellEnd >= cellStart) {
    cells.push(lineText.slice(cellStart, lastCellEnd).trim());
  }

  return cells;
}

export function isTableSeparatorRow(cells) {
  return cells.length > 0 &&
    cells.every(c => /^:?-+:?$/.test(c.trim()));
}

export function parseAlignments(cells) {
  return cells.map(c => {
    const trimmed = c.trim();
    const alignLeft = trimmed.startsWith(':');
    const alignRight = trimmed.endsWith(':');
    if (alignLeft && alignRight) return 'center';
    if (alignRight) return 'right';
    if (alignLeft) return 'left';
    return 'left';
  });
}

export class TableModel {
  constructor(rows = [], alignments = []) {
    this.rows = rows; // Array of Array of String (raw cell contents)
    this.alignments = alignments; // Array of String ('left'|'center'|'right')
  }

  static parse(tableMarkdown) {
    const lines = tableMarkdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return null;

    const parsedRows = lines.map(parsePipeRow);
    const header = parsedRows[0];
    const delimiter = parsedRows[1];
    if (
      !header ||
      !delimiter ||
      !isTableSeparatorRow(delimiter) ||
      header.length !== delimiter.length
    ) {
      return null;
    }

    const columnCount = header.length;
    if (columnCount === 0) return null;
    const alignments = parseAlignments(delimiter);
    const normalizedRows = [
      header,
      ...parsedRows.slice(2).filter(Boolean).map(row => {
        const cells = row.slice(0, columnCount);
        while (cells.length < columnCount) cells.push('');
        return cells;
      })
    ];

    return new TableModel(normalizedRows, alignments);
  }

  getRowCount() {
    return this.rows.length;
  }

  getColCount() {
    return this.alignments.length;
  }

  // Returns matrix of { content, rowSpan, colSpan, isCovered, isHeader }
  getRenderMatrix() {
    const rowCount = this.getRowCount();
    const colCount = this.getColCount();
    const matrix = Array.from({ length: rowCount }, () =>
      Array.from({ length: colCount }, () => ({
        content: '',
        rowSpan: 1,
        colSpan: 1,
        isCovered: false,
        isHeader: false
      }))
    );

    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        matrix[r][c].content = this.rows[r][c] || '';
        matrix[r][c].isHeader = (r === 0);
      }
    }

    // Process colSpan merges (<) and rowSpan merges (^)
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        if (matrix[r][c].isCovered) continue;

        // Check horizontal merges (<)
        let colSpan = 1;
        while (c + colSpan < colCount && this.rows[r][c + colSpan] === '<') {
          matrix[r][c + colSpan].isCovered = true;
          colSpan++;
        }
        matrix[r][c].colSpan = colSpan;

        // Check vertical merges (^)
        let rowSpan = 1;
        while (r + rowSpan < rowCount) {
          let canMergeRow = true;
          for (let k = 0; k < colSpan; k++) {
            if (this.rows[r + rowSpan][c + k] !== '^') {
              canMergeRow = false;
              break;
            }
          }
          if (canMergeRow) {
            for (let k = 0; k < colSpan; k++) {
              matrix[r + rowSpan][c + k].isCovered = true;
            }
            rowSpan++;
          } else {
            break;
          }
        }
        matrix[r][c].rowSpan = rowSpan;
      }
    }

    return matrix;
  }

  mergeRect(r1, c1, r2, c2) {
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    if (minR === maxR && minC === maxC) return;

    // Collect non-empty contents to preserve
    const mergedContents = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const val = this.rows[r][c];
        if (val && val !== '<' && val !== '^') {
          mergedContents.push(val);
        }
      }
    }

    const primaryContent = mergedContents.join(' <br> ');

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (r === minR && c === minC) {
          this.rows[r][c] = primaryContent;
        } else if (r === minR) {
          this.rows[r][c] = '<';
        } else {
          this.rows[r][c] = '^';
        }
      }
    }
  }

  insertRow(index) {
    const at = Math.max(1, Math.min(index, this.rows.length));
    const newRow = Array(this.getColCount()).fill('');
    if (at < this.rows.length) {
      for (let c = 0; c < this.getColCount(); c++) {
        if (this.rows[at][c] === '^') {
          newRow[c] = '^';
        }
      }
    }
    this.rows.splice(at, 0, newRow);
  }

  insertCol(index) {
    const at = Math.max(0, Math.min(index, this.getColCount()));
    const alignment = this.alignments[Math.max(0, at - 1)] || 'left';
    for (let r = 0; r < this.rows.length; r++) {
      const val = (at < this.rows[r].length && this.rows[r][at] === '<') ? '<' : '';
      this.rows[r].splice(at, 0, val);
    }
    this.alignments.splice(at, 0, alignment);
  }

  deleteRow(r) {
    if (this.rows.length <= 1) return;
    this.rows.splice(r, 1);
  }

  deleteCol(c) {
    if (this.getColCount() <= 1) return;
    for (let r = 0; r < this.rows.length; r++) {
      this.rows[r].splice(c, 1);
    }
    if (this.alignments.length > c) {
      this.alignments.splice(c, 1);
    }
  }

  mergeDirection(r, c, direction) {
    let targetR = r;
    let targetC = c;
    if (direction === 'right') targetC = c + 1;
    else if (direction === 'left') targetC = c - 1;
    else if (direction === 'down') targetR = r + 1;
    else if (direction === 'up') targetR = r - 1;

    if (targetR < 0 || targetR >= this.getRowCount() || targetC < 0 || targetC >= this.getColCount()) {
      return;
    }

    this.mergeRect(r, c, targetR, targetC);
  }

  splitCell(r, c) {
    const matrix = this.getRenderMatrix();
    const cell = matrix[r][c];
    if (cell.isCovered) return;
    if (cell.rowSpan === 1 && cell.colSpan === 1) return;

    for (let i = 0; i < cell.rowSpan; i++) {
      for (let j = 0; j < cell.colSpan; j++) {
        if (i === 0 && j === 0) continue;
        this.rows[r + i][c + j] = '';
      }
    }
  }

  toMarkdown() {
    if (this.rows.length === 0) return '';
    const colCount = this.getColCount();

    const formatRow = (rowCells) => {
      return '| ' + rowCells.map(c => c || '').join(' | ') + ' |';
    };

    const headerRow = formatRow(this.rows[0]);

    const sepRow = '| ' + this.alignments.map(a => {
      if (a === 'center') return ':---:';
      if (a === 'right') return '---:';
      return ':---';
    }).join(' | ') + ' |';

    const dataRows = this.rows.slice(1).map(formatRow);

    return [headerRow, sepRow, ...dataRows].join('\n');
  }
}
