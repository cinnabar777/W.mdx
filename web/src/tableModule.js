export function isEscapedPipe(text, index) {
  if (text[index] !== '|') return false;
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

export function parsePipeRow(lineText) {
  const pipeOffsets = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '|' && !isEscapedPipe(lineText, i)) pipeOffsets.push(i);
  }
  if (pipeOffsets.length === 0) return null;

  const hasLeadingPipe = /^\s*\|/.test(lineText);
  const hasTrailingPipe = /\|\s*$/.test(lineText);

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
    cells.every(c => /^:?-{3,}:?$/.test(c.trim()));
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

    const parsedRows = [];
    let sepIndex = -1;
    let alignments = [];

    for (let i = 0; i < lines.length; i++) {
      const cells = parsePipeRow(lines[i]);
      if (!cells) continue;
      if (isTableSeparatorRow(cells)) {
        sepIndex = i;
        alignments = parseAlignments(cells);
      } else {
        parsedRows.push(cells);
      }
    }

    if (parsedRows.length === 0) return null;

    // Normalize max column count
    let maxCols = alignments.length;
    for (const r of parsedRows) {
      if (r.length > maxCols) maxCols = r.length;
    }
    if (maxCols === 0) return null;

    while (alignments.length < maxCols) alignments.push('left');

    const normalizedRows = parsedRows.map(row => {
      const r = [...row];
      while (r.length < maxCols) r.push('');
      return r;
    });

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
