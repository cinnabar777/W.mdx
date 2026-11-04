import { tags } from '@lezer/highlight';

const singleTildeDelimiter = {
  resolve: 'Strikethrough',
  mark: 'StrikethroughMark'
};
const doubleTildeDelimiter = {
  resolve: 'Strikethrough',
  mark: 'StrikethroughMark'
};

export const wmdxGfmStrikethrough = {
  defineNodes: [
    {
      name: 'Strikethrough',
      style: { 'Strikethrough/...': tags.strikethrough }
    },
    {
      name: 'StrikethroughMark',
      style: tags.processingInstruction
    }
  ],
  parseInline: [
    {
      name: 'WmdxGfmStrikethrough',
      after: 'Emphasis',
      parse(cx, next, pos) {
        if (next !== 126) return -1;

        let end = pos + 1;
        while (cx.char(end) === 126) end++;

        const runLength = end - pos;
        if (runLength > 2) return end;

        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(end, end + 1);
        const whitespaceBefore = /\s|^$/.test(before);
        const whitespaceAfter = /\s|^$/.test(after);
        const punctuationBefore =
          /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(before);
        const punctuationAfter =
          /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(after);
        const delimiter = runLength === 1
          ? singleTildeDelimiter
          : doubleTildeDelimiter;

        return cx.addDelimiter(
          delimiter,
          pos,
          end,
          !whitespaceAfter &&
            (!punctuationAfter || whitespaceBefore || punctuationBefore),
          !whitespaceBefore &&
            (!punctuationBefore || whitespaceAfter || punctuationAfter)
        );
      }
    }
  ]
};
