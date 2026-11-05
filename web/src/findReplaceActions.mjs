import { SearchQuery, setSearchQuery } from '@codemirror/search';

export function clearFindHighlights(view) {
  if (!view) return false;
  view.dispatch({
    effects: setSearchQuery.of(new SearchQuery({ search: '' }))
  });
  return true;
}

export function handleFindEnterKey(event, onFind) {
  if (
    !event ||
    event.key !== 'Enter' ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return false;
  }

  event.preventDefault();
  onFind(Boolean(event.shiftKey));
  return true;
}
