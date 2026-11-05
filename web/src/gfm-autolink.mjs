function countCharacter(text, from, to, character) {
  let count = 0;
  for (let index = from; index < to; index++) {
    if (text[index] === character) count++;
  }
  return count;
}

function trimAutolinkEnd(text, from, end) {
  while (
    end > from &&
    /[?!.,:*_~]/.test(text[end - 1])
  ) {
    end--;
  }

  while (
    end > from &&
    text[end - 1] === ')' &&
    countCharacter(text, from, end, ')') >
      countCharacter(text, from, end, '(')
  ) {
    end--;
  }

  if (text[end - 1] === ';') {
    const entity = /&(?:#\d+|#x[a-f\d]+|\w+);$/i.exec(text.slice(from, end));
    if (entity) end = from + entity.index;
  }

  return end;
}

export const wmdxGfmFtpAutolink = {
  parseInline: [{
    name: 'WmdxGfmFtpAutolink',
    after: 'Autolink',
    parse(cx, next, absolutePosition) {
      if (next !== 70 && next !== 102) return -1;

      const position = absolutePosition - cx.offset;
      if (position && /\w/.test(cx.text[position - 1])) return -1;

      const prefix = /^ftp:\/\//i.exec(cx.text.slice(position));
      if (!prefix) return -1;

      let end = position + prefix[0].length;
      while (end < cx.text.length && !/[\s<>]/.test(cx.text[end])) end++;
      if (end === position + prefix[0].length) return -1;
      end = trimAutolinkEnd(cx.text, position, end);
      if (end <= position + prefix[0].length) return -1;

      if (cx.hasOpenLink) {
        const bracketSafe = /([^\[\]]|\[[^\]]*\])*/.exec(
          cx.text.slice(position, end)
        );
        end = position + bracketSafe[0].length;
      }

      if (end <= position + prefix[0].length) return -1;
      cx.addElement(cx.elt('URL', absolutePosition, end + cx.offset));
      return end + cx.offset;
    }
  }]
};
