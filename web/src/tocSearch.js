export function countDocumentText(markdown) {
  const text = String(markdown ?? '');
  const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  return {
    words: words.length,
    characters: Array.from(text).length
  };
}

export function getTocSearchState(items, query) {
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase();
  const matchingIndexes = new Set();
  const visibleIndexes = new Set();

  if (!normalizedQuery) {
    items.forEach((_, index) => visibleIndexes.add(index));
    return { matchingIndexes, visibleIndexes };
  }

  items.forEach((item, index) => {
    if (String(item.title ?? '').toLocaleLowerCase().includes(normalizedQuery)) {
      matchingIndexes.add(index);
      visibleIndexes.add(index);

      let parentLevel = Number(item.level) || 1;
      for (let parentIndex = index - 1; parentIndex >= 0; parentIndex--) {
        const level = Number(items[parentIndex].level) || 1;
        if (level < parentLevel) {
          visibleIndexes.add(parentIndex);
          parentLevel = level;
          if (parentLevel === 1) break;
        }
      }
    }
  });

  return { matchingIndexes, visibleIndexes };
}

export function findTocMatchRanges(text, query) {
  const source = String(text ?? '');
  const normalizedSource = source.toLocaleLowerCase();
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const ranges = [];
  let from = 0;
  while (from <= normalizedSource.length - normalizedQuery.length) {
    const matchAt = normalizedSource.indexOf(normalizedQuery, from);
    if (matchAt < 0) break;
    ranges.push({ from: matchAt, to: matchAt + normalizedQuery.length });
    from = matchAt + Math.max(1, normalizedQuery.length);
  }
  return ranges;
}
