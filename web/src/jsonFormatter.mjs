import { jsonLanguage } from '@codemirror/lang-json';

function directChildren(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function formatValue(node, source, depth, indent) {
  if (node.name === 'JsonText') {
    const value = directChildren(node).find(child => child.name !== '⚠');
    return value ? formatValue(value, source, depth, indent) : source.slice(node.from, node.to);
  }

  if (node.name === 'Object') {
    const properties = directChildren(node).filter(child => child.name === 'Property');
    if (!properties.length) return '{}';
    const contents = properties.map(property => {
      const propertyChildren = directChildren(property);
      const key = propertyChildren.find(child => child.name === 'PropertyName');
      const value = [...propertyChildren].reverse().find(child =>
        child.name !== 'PropertyName' && child.name !== ':'
      );
      if (!key || !value) return source.slice(property.from, property.to);
      return `${indent.repeat(depth + 1)}${source.slice(key.from, key.to)}: ` +
        formatValue(value, source, depth + 1, indent);
    });
    return `{\n${contents.join(',\n')}\n${indent.repeat(depth)}}`;
  }

  if (node.name === 'Array') {
    const values = directChildren(node).filter(child =>
      child.name !== '[' && child.name !== ']' && child.name !== ','
    );
    if (!values.length) return '[]';
    const contents = values.map(value =>
      `${indent.repeat(depth + 1)}${formatValue(value, source, depth + 1, indent)}`
    );
    return `[\n${contents.join(',\n')}\n${indent.repeat(depth)}]`;
  }

  return source.slice(node.from, node.to);
}

function parseErrorLocation(errorMessage, source) {
  let offset = null;
  const position = /at position\s+(\d+)/i.exec(errorMessage);
  const lineColumn = /at line\s+(\d+)\s+column\s+(\d+)/i.exec(errorMessage);
  if (position) {
    offset = Math.min(Number(position[1]), source.length);
  } else if (lineColumn) {
    const line = Math.max(1, Number(lineColumn[1]));
    const column = Math.max(1, Number(lineColumn[2]));
    const lines = source.split('\n');
    offset = lines.slice(0, line - 1).reduce((total, part) => total + part.length + 1, 0) +
      column - 1;
    offset = Math.min(offset, source.length);
  }
  if (offset === null) {
    const tree = jsonLanguage.parser.parse(source);
    tree.iterate({
      enter(node) {
        if (offset === null && node.type.isError) offset = node.from;
      }
    });
  }
  if (offset === null) offset = 0;
  const beforeError = source.slice(0, offset);
  const line = beforeError.split('\n').length;
  const lastNewline = beforeError.lastIndexOf('\n');
  return { offset, line, column: offset - lastNewline };
}

/**
 * Re-indent valid JSON while preserving every original token and its order.
 * This deliberately avoids JSON.parse/stringify for output, which would drop
 * duplicate keys and can normalize number spellings.
 */
export function formatJsonWhitespace(value, { indent = '  ' } = {}) {
  const source = String(value ?? '');
  try {
    JSON.parse(source);
  } catch (error) {
    const location = parseErrorLocation(error?.message || '', source);
    return {
      ok: false,
      error: error?.message || 'Invalid JSON.',
      ...location
    };
  }

  const tree = jsonLanguage.parser.parse(source);
  const root = directChildren(tree.topNode).find(child => child.name !== '⚠');
  if (!root || tree.topNode.type.isError) {
    return {
      ok: false,
      error: 'Invalid JSON.',
      offset: 0,
      line: 1,
      column: 1
    };
  }

  const safeIndent = typeof indent === 'string' ? indent.slice(0, 8) : '  ';
  const formatted = formatValue(root, source, 0, safeIndent);
  const trailingNewline = /\n$/.test(source);
  return {
    ok: true,
    formatted: trailingNewline ? `${formatted}\n` : formatted
  };
}
