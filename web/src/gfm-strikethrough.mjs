import { tags } from '@lezer/highlight';

const singleTildeDelimiter = {
  resolve: 'Subscript',
  mark: 'SubscriptMark'
};
const doubleTildeDelimiter = {
  resolve: 'Strikethrough',
  mark: 'StrikethroughMark'
};

export function createWmdxGfmTildeExtension({
  gfmStrikethrough = true,
  wmdxSubscript = true
} = {}) {
  return {
    defineNodes: [
      {
        name: 'Strikethrough',
        style: { 'Strikethrough/...': tags.strikethrough }
      },
      {
        name: 'StrikethroughMark',
        style: tags.processingInstruction
      },
      {
        name: 'Subscript'
      },
      {
        name: 'SubscriptMark',
        style: tags.processingInstruction
      }
    ],
    parseInline: [
      {
        name: 'WmdxGfmTildeSyntax',
        after: 'Emphasis',
        parse(cx, next, pos) {
          if (next !== 126) return -1;

          let end = pos + 1;
          while (cx.char(end) === 126) end++;

          const runLength = end - pos;
          if (runLength > 2) return end;
          if (runLength === 1 && !wmdxSubscript) return -1;
          if (runLength === 2 && !gfmStrikethrough) return end;

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
}

export const wmdxGfmStrikethrough = createWmdxGfmTildeExtension();
