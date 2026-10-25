const icon = (paths) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const TABLE_ACTIONS = Object.freeze([
  {
    id: 'insertRowBelow',
    title: 'Add Row Below',
    icon: icon('<rect x="3" y="3" width="18" height="15" rx="1"/><path d="M3 9h18M3 15h18M12 19v3m-2-1.5h4"/>')
  },
  {
    id: 'insertColumnRight',
    title: 'Add Column Right',
    icon: icon('<rect x="3" y="3" width="15" height="18" rx="1"/><path d="M9 3v18M15 3v18M19 12h3m-1.5-2v4"/>')
  },
  {
    id: 'deleteRow',
    title: 'Delete Row',
    icon: icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M8 18h8"/>')
  },
  {
    id: 'deleteColumn',
    title: 'Delete Column',
    icon: icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M6 12h4"/>')
  },
  {
    id: 'mergeLeft',
    title: 'Merge Left',
    icon: icon('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M17 12h-7m0 0 2.5-2.5M10 12l2.5 2.5"/>')
  },
  {
    id: 'mergeRight',
    title: 'Merge Right',
    icon: icon('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M7 12h7m0 0-2.5-2.5M14 12l-2.5 2.5"/>')
  },
  {
    id: 'mergeUp',
    title: 'Merge Up',
    icon: icon('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 12h14M12 17v-7m0 0-2.5 2.5M12 10l2.5 2.5"/>')
  },
  {
    id: 'mergeDown',
    title: 'Merge Down',
    icon: icon('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 12h14M12 7v7m0 0-2.5-2.5M12 14l2.5-2.5"/>')
  },
  {
    id: 'splitCell',
    title: 'Split Cell',
    icon: icon('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>')
  }
]);
