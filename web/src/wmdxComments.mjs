import { tags } from '@lezer/highlight';

export const wmdxCommentsExtension = {
  defineNodes: [
    {
      name: 'Comment',
      style: tags.comment
    },
    {
      name: 'CommentMark',
      style: tags.processingInstruction
    }
  ],
  parseInline: [
    {
      name: 'WmdxComment',
      parse(cx, next, pos) {
        if (next === 47 && cx.char(pos + 1) === 42) {
          let end = pos + 2;
          while (end < cx.end) {
            if (cx.char(end) === 42 && cx.char(end + 1) === 47) {
              end += 2;
              return cx.addElement(cx.elt('Comment', pos, end, [
                cx.elt('CommentMark', pos, pos + 2),
                cx.elt('CommentMark', end - 2, end)
              ]));
            }
            end++;
          }
        } else if (next === 37 && cx.char(pos + 1) === 37) {
          let end = pos + 2;
          while (end < cx.end) {
            if (cx.char(end) === 37 && cx.char(end + 1) === 37) {
              end += 2;
              return cx.addElement(cx.elt('Comment', pos, end, [
                cx.elt('CommentMark', pos, pos + 2),
                cx.elt('CommentMark', end - 2, end)
              ]));
            }
            end++;
          }
        }
        return -1;
      }
    }
  ]
};
