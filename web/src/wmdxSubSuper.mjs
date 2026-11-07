import { tags } from '@lezer/highlight';

const superscriptDelimiter = {
  resolve: 'Superscript',
  mark: 'SuperscriptMark'
};

const subscriptDelimiter = {
  resolve: 'Subscript',
  mark: 'SubscriptMark'
};

export const wmdxSubSuperExtension = {
  defineNodes: [
    {
      name: 'Superscript',
      style: tags.special(tags.content)
    },
    {
      name: 'SuperscriptMark',
      style: tags.processingInstruction
    },
    {
      name: 'Subscript',
      style: tags.special(tags.content)
    },
    {
      name: 'SubscriptMark',
      style: tags.processingInstruction
    }
  ],
  parseInline: [
    {
      name: 'WmdxSuperscript',
      after: 'Emphasis',
      parse(cx, next, pos) {
        if (next !== 94) return -1;
        if (cx.slice(pos - 1, pos) === '\\') return -1;

        let end = pos + 1;
        while (cx.char(end) === 94) end++;
        if (end - pos > 1) return -1;

        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(end, end + 1);
        const whitespaceBefore = /\s|^$/.test(before);
        const whitespaceAfter = /\s|^$/.test(after);

        return cx.addDelimiter(
          superscriptDelimiter,
          pos,
          end,
          !whitespaceAfter,
          !whitespaceBefore
        );
      }
    },
    {
      name: 'WmdxSubscript',
      after: 'Emphasis',
      parse(cx, next, pos) {
        if (next !== 126) return -1;
        if (cx.slice(pos - 1, pos) === '\\') return -1;

        let end = pos + 1;
        while (cx.char(end) === 126) end++;
        if (end - pos !== 1) return -1;

        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(end, end + 1);
        const whitespaceBefore = /\s|^$/.test(before);
        const whitespaceAfter = /\s|^$/.test(after);

        return cx.addDelimiter(
          subscriptDelimiter,
          pos,
          end,
          !whitespaceAfter,
          !whitespaceBefore
        );
      }
    }
  ]
};
